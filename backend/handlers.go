package backend

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Auth handles /api/auth.
//
//	GET    → {"authenticated": bool}
//	POST   {"password": "..."} → sets the session cookie
//	DELETE → clears the session cookie
func Auth(s *Server, w http.ResponseWriter, r *http.Request) error {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": s.hasValidSession(r)})
		return nil

	case http.MethodPost:
		if err := assertSameOrigin(r); err != nil {
			return err
		}
		var body struct {
			Password string `json:"password"`
		}
		if err := readJSON(w, r, 4<<10, &body); err != nil {
			return err
		}
		if !s.checkPassword(body.Password) {
			time.Sleep(s.LoginFailure) // slow down guessing
			return errorf(http.StatusUnauthorized, "Wrong password")
		}
		http.SetCookie(w, s.newSessionCookie())
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
		return nil

	case http.MethodDelete:
		if err := assertSameOrigin(r); err != nil {
			return err
		}
		http.SetCookie(w, clearedSessionCookie())
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
		return nil
	}
	return methodNotAllowed(w, "GET", "POST", "DELETE")
}

// Content handles /api/content (admin only).
//
//	GET → {"data": {...} | null, "sha": "..." | null}
//	PUT {"data": {...}, "baseSha": "...", "message": "...", "force": bool}
//	    → commits public/data/portfolio.json and returns {"data", "sha", "commitUrl"}
func Content(s *Server, w http.ResponseWriter, r *http.Request) error {
	switch r.Method {
	case http.MethodGet:
		if err := s.requireSession(r); err != nil {
			return err
		}
		file, err := s.GitHub.GetFile(r.Context(), DataPath)
		if err != nil {
			return err
		}
		if file == nil {
			writeJSON(w, http.StatusOK, map[string]any{"data": nil, "sha": nil})
			return nil
		}
		if !json.Valid(file.Content) {
			return errorf(http.StatusInternalServerError, DataPath+" in the repository is not valid JSON")
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": json.RawMessage(file.Content), "sha": file.SHA})
		return nil

	case http.MethodPut:
		if err := assertSameOrigin(r); err != nil {
			return err
		}
		if err := s.requireSession(r); err != nil {
			return err
		}
		var body struct {
			Data    json.RawMessage `json:"data"`
			BaseSHA string          `json:"baseSha"`
			Message string          `json:"message"`
			Force   bool            `json:"force"`
		}
		if err := readJSON(w, r, maxContentBody, &body); err != nil {
			return err
		}
		if err := validatePortfolio(body.Data); err != nil {
			return err
		}
		message := strings.TrimSpace(body.Message)
		if message == "" {
			message = "Update portfolio content"
		}
		if runes := []rune(message); len(runes) > 200 {
			message = string(runes[:200])
		}

		latest, err := s.GitHub.GetFile(r.Context(), DataPath)
		if err != nil {
			return err
		}
		latestSHA := ""
		if latest != nil {
			latestSHA = latest.SHA
		}
		if !body.Force && body.BaseSHA != "" && latestSHA != "" && body.BaseSHA != latestSHA {
			return &APIError{
				Status:  http.StatusConflict,
				Message: "The portfolio data changed since you started editing.",
				Extra:   map[string]any{"conflict": true, "latestSha": latestSHA},
			}
		}

		updated := s.Now().In(jakarta).Format("2006-01-02")
		text, err := withUpdatedDate(body.Data, updated)
		if err != nil {
			return err
		}
		commit, err := s.GitHub.PutFile(r.Context(), DataPath, text, message, latestSHA)
		if err != nil {
			return err
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"data":      json.RawMessage(text),
			"sha":       commit.SHA,
			"commitUrl": commit.CommitURL,
		})
		return nil
	}
	return methodNotAllowed(w, "GET", "PUT")
}

var listKeys = []string{"experience", "projects", "education", "skills", "training"}

// validatePortfolio checks the overall shape of the content document.
func validatePortfolio(raw json.RawMessage) error {
	var doc map[string]json.RawMessage
	if len(bytes.TrimSpace(raw)) == 0 || json.Unmarshal(raw, &doc) != nil || doc == nil {
		return errorf(http.StatusBadRequest, `"data" must be an object`)
	}
	if !startsWith(doc["profile"], '{') {
		return errorf(http.StatusBadRequest, `"data.profile" must be an object`)
	}
	for _, key := range listKeys {
		if v, ok := doc[key]; ok && !startsWith(v, '[') {
			return errorf(http.StatusBadRequest, fmt.Sprintf(`"data.%s" must be a list`, key))
		}
	}
	return nil
}

func startsWith(raw json.RawMessage, c byte) bool {
	t := bytes.TrimSpace(raw)
	return len(t) > 0 && t[0] == c
}

// withUpdatedDate sets meta.updated while keeping the key order of the
// document, and returns it indented with two spaces like JSON.stringify.
func withUpdatedDate(raw json.RawMessage, date string) ([]byte, error) {
	fields, err := orderedFields(raw)
	if err != nil {
		return nil, errorf(http.StatusBadRequest, `"data" must be an object`)
	}
	dateJSON, _ := json.Marshal(date)
	metaIndex := -1
	for i, f := range fields {
		if f.key == "meta" {
			metaIndex = i
		}
	}
	var meta []field
	if metaIndex >= 0 && startsWith(fields[metaIndex].value, '{') {
		if meta, err = orderedFields(fields[metaIndex].value); err != nil {
			return nil, errorf(http.StatusBadRequest, `"data.meta" must be an object`)
		}
	}
	replaced := false
	for i := range meta {
		if meta[i].key == "updated" {
			meta[i].value = dateJSON
			replaced = true
		}
	}
	if !replaced {
		meta = append(meta, field{key: "updated", value: dateJSON})
	}
	metaJSON := encodeFields(meta)
	if metaIndex >= 0 {
		fields[metaIndex].value = metaJSON
	} else {
		fields = append([]field{{key: "meta", value: metaJSON}}, fields...)
	}

	var out bytes.Buffer
	if err := json.Indent(&out, encodeFields(fields), "", "  "); err != nil {
		return nil, err
	}
	out.WriteByte('\n')
	return out.Bytes(), nil
}

type field struct {
	key   string
	value json.RawMessage
}

func orderedFields(raw json.RawMessage) ([]field, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return nil, fmt.Errorf("not an object")
	}
	var fields []field
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		key, _ := tok.(string)
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return nil, err
		}
		fields = append(fields, field{key: key, value: value})
	}
	return fields, nil
}

func encodeFields(fields []field) []byte {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, f := range fields {
		if i > 0 {
			buf.WriteByte(',')
		}
		key, _ := json.Marshal(f.key)
		buf.Write(key)
		buf.WriteByte(':')
		_ = json.Compact(&buf, f.value)
	}
	buf.WriteByte('}')
	return buf.Bytes()
}

var imageTypes = []struct {
	ext   string
	match func([]byte) bool
}{
	{"jpg", func(b []byte) bool { return bytes.HasPrefix(b, []byte{0xff, 0xd8, 0xff}) }},
	{"png", func(b []byte) bool { return bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")) }},
	{"webp", func(b []byte) bool { return len(b) >= 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WEBP" }},
}

var unsafeName = regexp.MustCompile(`[^a-z0-9]+`)

// Upload handles POST /api/upload (admin only):
// {"filename": "...", "content": "<base64>"} → {"path": "images/..."}
func Upload(s *Server, w http.ResponseWriter, r *http.Request) error {
	if r.Method != http.MethodPost {
		return methodNotAllowed(w, "POST")
	}
	if err := assertSameOrigin(r); err != nil {
		return err
	}
	if err := s.requireSession(r); err != nil {
		return err
	}
	var body struct {
		Filename string `json:"filename"`
		Content  string `json:"content"`
	}
	if err := readJSON(w, r, maxImageBytes*4/3+4096, &body); err != nil {
		return err
	}
	data, err := base64.StdEncoding.DecodeString(body.Content)
	if err != nil {
		return errorf(http.StatusBadRequest, `"content" must be base64`)
	}
	if len(data) == 0 {
		return errorf(http.StatusBadRequest, "Empty file")
	}
	if len(data) > maxImageBytes {
		return errorf(http.StatusRequestEntityTooLarge, "Image is larger than 3 MB")
	}
	ext := ""
	for _, t := range imageTypes {
		if t.match(data) {
			ext = t.ext
			break
		}
	}
	if ext == "" {
		return errorf(http.StatusUnsupportedMediaType, "Only JPEG, PNG or WebP images are allowed")
	}

	base := strings.ToLower(body.Filename)
	if i := strings.LastIndex(base, "."); i > 0 {
		base = base[:i]
	}
	base = strings.Trim(unsafeName.ReplaceAllString(base, "-"), "-")
	if len(base) > 40 {
		base = strings.TrimRight(base[:40], "-")
	}
	if base == "" {
		base = "photo"
	}
	name := fmt.Sprintf("%s-%s.%s", base, strconv.FormatInt(s.Now().UnixMilli(), 36), ext)
	if _, err := s.GitHub.PutFile(r.Context(), ImageDir+"/"+name, data, "Upload image images/"+name, ""); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": "images/" + name})
	return nil
}

// SEO serves /robots.txt and /sitemap.xml (via vercel.json rewrites to
// /api/seo?file=robots|sitemap) for whichever domain the site runs on.
// It needs no configuration, so it is a plain http.HandlerFunc.
func SEO(w http.ResponseWriter, r *http.Request) {
	origin := html.EscapeString(siteOrigin(r))
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if r.URL.Query().Get("file") == "sitemap" {
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>%s/</loc></url>
</urlset>
`, origin)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprintf(w, "User-agent: *\nDisallow: /admin\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: %s/sitemap.xml\n", origin)
}
