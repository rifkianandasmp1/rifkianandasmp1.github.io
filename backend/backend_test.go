package backend

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

const origin = "https://portfolio.example"

// fakeGitHub is an in-memory stand-in for the GitHub Contents API.
type fakeGitHub struct {
	mu      sync.Mutex
	files   map[string]File
	commits []map[string]string
}

func (f *fakeGitHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer server-token" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	switch r.URL.Path {
	case "/repos/owner/repo", "/repos/owner/repo/branches/main":
		fmt.Fprint(w, `{}`)
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/repos/owner/repo/contents/") {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `{"message":"Not Found"}`)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/repos/owner/repo/contents/")
	switch r.Method {
	case http.MethodGet:
		file, ok := f.files[path]
		if !ok || r.URL.Query().Get("ref") != "main" {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, `{"message":"Not Found"}`)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"sha": file.SHA, "size": len(file.Content), "content": base64.StdEncoding.EncodeToString(file.Content),
		})
	case http.MethodPut:
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		if existing, ok := f.files[path]; ok && body["sha"] != existing.SHA {
			w.WriteHeader(http.StatusConflict)
			return
		}
		content, _ := base64.StdEncoding.DecodeString(body["content"])
		sha := fmt.Sprintf("sha-%d", len(f.commits)+2)
		f.files[path] = File{Content: content, SHA: sha}
		body["path"] = path
		f.commits = append(f.commits, body)
		json.NewEncoder(w).Encode(map[string]any{
			"content": map[string]string{"sha": sha},
			"commit":  map[string]string{"html_url": "https://github.com/commit/" + sha},
		})
	}
}

func setup(t *testing.T) (*Server, *fakeGitHub) {
	t.Helper()
	gh := &fakeGitHub{files: map[string]File{
		DataPath: {Content: []byte(`{"profile":{"first_name":"M. Rifki"},"meta":{"title":"T","updated":"2020-01-01"},"projects":[]}`), SHA: "sha-1"},
	}}
	ts := httptest.NewServer(gh)
	t.Cleanup(ts.Close)
	s := &Server{
		AdminPassword: "correct horse battery",
		SessionSecret: []byte(strings.Repeat("x", 48)),
		GitHub:        &GitHub{Token: "server-token", Owner: "owner", Repo: "repo", Branch: "main", BaseURL: ts.URL},
		Now:           func() time.Time { return time.Date(2026, 10, 10, 20, 0, 0, 0, time.UTC) },
	}
	return s, gh
}

type call struct {
	method, path, body, cookie string
	origin                     *string
}

func do(s *Server, e Endpoint, c call) *httptest.ResponseRecorder {
	var body io.Reader
	if c.body != "" {
		body = strings.NewReader(c.body)
	}
	r := httptest.NewRequest(c.method, origin+c.path, body)
	if c.body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	if c.origin == nil {
		r.Header.Set("Origin", origin)
	} else if *c.origin != "" {
		r.Header.Set("Origin", *c.origin)
	}
	if c.cookie != "" {
		r.Header.Set("Cookie", c.cookie)
	}
	w := httptest.NewRecorder()
	s.Handle(e)(w, r)
	return w
}

func login(t *testing.T, s *Server) string {
	t.Helper()
	w := do(s, Auth, call{method: "POST", path: "/api/auth", body: `{"password":"correct horse battery"}`})
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body)
	}
	return strings.Split(w.Header().Get("Set-Cookie"), ";")[0]
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("decode %q: %v", w.Body, err)
	}
	return m
}

func ptr(s string) *string { return &s }

func TestLogin(t *testing.T) {
	s, _ := setup(t)
	w := do(s, Auth, call{method: "POST", path: "/api/auth", body: `{"password":"nope"}`})
	if w.Code != 401 || w.Header().Get("Set-Cookie") != "" {
		t.Fatalf("wrong password: got %d, cookie %q", w.Code, w.Header().Get("Set-Cookie"))
	}

	w = do(s, Auth, call{method: "POST", path: "/api/auth", body: `{"password":"correct horse battery"}`})
	cookie := w.Header().Get("Set-Cookie")
	for _, attr := range []string{"HttpOnly", "Secure", "SameSite=Strict", "Path=/"} {
		if !strings.Contains(cookie, attr) {
			t.Errorf("cookie %q lacks %s", cookie, attr)
		}
	}
	status := do(s, Auth, call{method: "GET", path: "/api/auth", cookie: strings.Split(cookie, ";")[0]})
	if got := decode(t, status)["authenticated"]; got != true {
		t.Fatalf("authenticated = %v", got)
	}

	logout := do(s, Auth, call{method: "DELETE", path: "/api/auth"})
	if !strings.Contains(logout.Header().Get("Set-Cookie"), "Max-Age=0") {
		t.Errorf("logout did not clear cookie: %q", logout.Header().Get("Set-Cookie"))
	}
}

func TestCrossOriginWritesAreBlocked(t *testing.T) {
	s, gh := setup(t)
	cookie := login(t, s)
	evil := do(s, Content, call{method: "PUT", path: "/api/content", body: `{"data":{"profile":{}}}`, cookie: cookie, origin: ptr("https://evil.example")})
	if evil.Code != 403 {
		t.Errorf("cross-origin PUT: %d", evil.Code)
	}
	none := do(s, Auth, call{method: "POST", path: "/api/auth", body: `{"password":"correct horse battery"}`, origin: ptr("")})
	if none.Code != 403 {
		t.Errorf("origin-less login: %d", none.Code)
	}
	if len(gh.commits) != 0 {
		t.Errorf("unexpected commits: %v", gh.commits)
	}
}

func TestSessionValidation(t *testing.T) {
	s, _ := setup(t)
	if w := do(s, Content, call{method: "GET", path: "/api/content"}); w.Code != 401 {
		t.Fatalf("no cookie: %d", w.Code)
	}
	cookie := login(t, s)
	name, value, _ := strings.Cut(cookie, "=")
	payload, sig, _ := strings.Cut(value, ".")

	tampered := name + "=" + payload + "." + strings.Repeat("A", len(sig))
	if w := do(s, Content, call{method: "GET", path: "/api/content", cookie: tampered}); w.Code != 401 {
		t.Errorf("tampered signature: %d", w.Code)
	}
	expired := b64.EncodeToString([]byte(`{"exp":1}`))
	if w := do(s, Content, call{method: "GET", path: "/api/content", cookie: name + "=" + expired + "." + s.sign(expired)}); w.Code != 401 {
		t.Errorf("expired session: %d", w.Code)
	}

	w := do(s, Content, call{method: "GET", path: "/api/content", cookie: cookie})
	body := decode(t, w)
	if w.Code != 200 || body["sha"] != "sha-1" || body["data"].(map[string]any)["profile"] == nil {
		t.Fatalf("GET content: %d %s", w.Code, w.Body)
	}
}

func TestPublish(t *testing.T) {
	s, gh := setup(t)
	cookie := login(t, s)
	data := `{"profile":{"first_name":"Rifki ✓ <b>"},"meta":{"title":"T","updated":"2020-01-01"},"projects":[]}`

	w := do(s, Content, call{method: "PUT", path: "/api/content", cookie: cookie,
		body: `{"data":` + data + `,"baseSha":"sha-1","message":"Update profile"}`})
	if w.Code != 200 {
		t.Fatalf("publish: %d %s", w.Code, w.Body)
	}
	saved := string(gh.files[DataPath].Content)
	want := `{
  "profile": {
    "first_name": "Rifki ✓ <b>"
  },
  "meta": {
    "title": "T",
    "updated": "2026-10-11"
  },
  "projects": []
}
`
	if saved != want {
		t.Errorf("saved file:\n%s\nwant:\n%s", saved, want)
	}
	if c := gh.commits[0]; c["sha"] != "sha-1" || c["branch"] != "main" || c["message"] != "Update profile" {
		t.Errorf("commit = %v", c)
	}

	stale := do(s, Content, call{method: "PUT", path: "/api/content", cookie: cookie, body: `{"data":` + data + `,"baseSha":"sha-1"}`})
	if stale.Code != 409 || decode(t, stale)["conflict"] != true {
		t.Fatalf("stale publish: %d %s", stale.Code, stale.Body)
	}
	forced := do(s, Content, call{method: "PUT", path: "/api/content", cookie: cookie, body: `{"data":` + data + `,"baseSha":"sha-1","force":true}`})
	if forced.Code != 200 || len(gh.commits) != 2 {
		t.Fatalf("forced publish: %d, commits %d", forced.Code, len(gh.commits))
	}
}

func TestPublishAddsMetaWhenMissing(t *testing.T) {
	got, err := withUpdatedDate(json.RawMessage(`{"profile":{}}`), "2026-01-02")
	if err != nil {
		t.Fatal(err)
	}
	if want := "{\n  \"meta\": {\n    \"updated\": \"2026-01-02\"\n  },\n  \"profile\": {}\n}\n"; string(got) != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestPublishRejectsMalformedData(t *testing.T) {
	s, gh := setup(t)
	cookie := login(t, s)
	for _, data := range []string{`[]`, `"x"`, `{"projects":[]}`, `{"profile":{},"projects":"x"}`} {
		w := do(s, Content, call{method: "PUT", path: "/api/content", cookie: cookie, body: `{"data":` + data + `}`})
		if w.Code != 400 {
			t.Errorf("data %s: got %d", data, w.Code)
		}
	}
	if len(gh.commits) != 0 {
		t.Errorf("unexpected commits")
	}
}

func TestUpload(t *testing.T) {
	s, gh := setup(t)
	cookie := login(t, s)
	upload := func(name string, content []byte) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"filename": name, "content": base64.StdEncoding.EncodeToString(content)})
		return do(s, Upload, call{method: "POST", path: "/api/upload", cookie: cookie, body: string(body)})
	}
	if w := upload("a.jpg", []byte("<script>")); w.Code != 415 {
		t.Errorf("non-image: %d", w.Code)
	}
	if w := upload("big.jpg", append([]byte{0xff, 0xd8, 0xff}, make([]byte, maxImageBytes)...)); w.Code != 413 {
		t.Errorf("too large: %d", w.Code)
	}
	w := upload("My Photo!.png", []byte{0xff, 0xd8, 0xff, 0xe0, 1, 2, 3})
	if w.Code != 200 {
		t.Fatalf("upload: %d %s", w.Code, w.Body)
	}
	path := decode(t, w)["path"].(string)
	if !regexp.MustCompile(`^images/my-photo-[a-z0-9]+\.jpg$`).MatchString(path) {
		t.Errorf("path = %q", path)
	}
	if gh.commits[0]["path"] != "public/"+path {
		t.Errorf("committed to %q", gh.commits[0]["path"])
	}
}

func TestMethodNotAllowed(t *testing.T) {
	s, _ := setup(t)
	w := do(s, Upload, call{method: "GET", path: "/api/upload"})
	if w.Code != 405 || w.Header().Get("Allow") != "POST" {
		t.Errorf("got %d, Allow=%q", w.Code, w.Header().Get("Allow"))
	}
}

func TestSEO(t *testing.T) {
	get := func(q string) string {
		r := httptest.NewRequest("GET", origin+"/api/seo?"+q, nil)
		r.Header.Set("X-Forwarded-Proto", "https")
		w := httptest.NewRecorder()
		SEO(w, r)
		return w.Body.String()
	}
	if robots := get("file=robots"); !strings.Contains(robots, "Disallow: /admin") || !strings.Contains(robots, "Sitemap: https://portfolio.example/sitemap.xml") {
		t.Errorf("robots.txt = %q", robots)
	}
	if sitemap := get("file=sitemap"); !strings.Contains(sitemap, "<loc>https://portfolio.example/</loc>") {
		t.Errorf("sitemap.xml = %q", sitemap)
	}
}

func TestFromEnvReportsMissingConfig(t *testing.T) {
	for _, k := range []string{"ADMIN_PASSWORD", "SESSION_SECRET", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG"} {
		t.Setenv(k, "")
	}
	t.Setenv("ADMIN_PASSWORD", "short")
	_, err := FromEnv()
	if err == nil || !strings.Contains(err.Error(), "GITHUB_TOKEN") || !strings.Contains(err.Error(), "ADMIN_PASSWORD") {
		t.Fatalf("err = %v", err)
	}
}

func TestMissingContentExplainsMisconfiguration(t *testing.T) {
	s, gh := setup(t)
	cookie := login(t, s)
	get := func() (int, map[string]any) {
		w := do(s, Content, call{method: "GET", path: "/api/content", cookie: cookie})
		return w.Code, decode(t, w)
	}

	s.GitHub.Branch = "typo-branch"
	if code, body := get(); code != 500 || !strings.Contains(body["error"].(string), `Branch "typo-branch" does not exist`) {
		t.Errorf("wrong branch: %d %v", code, body)
	}
	w := do(s, Content, call{method: "PUT", path: "/api/content", cookie: cookie, body: `{"data":{"profile":{}}}`})
	if w.Code != 500 || len(gh.commits) != 0 {
		t.Errorf("publish to wrong branch: %d, commits %d", w.Code, len(gh.commits))
	}

	s.GitHub.Branch = "main"
	s.GitHub.Repo = "wrong-repo"
	if code, body := get(); code != 500 || !strings.Contains(body["error"].(string), `"owner/wrong-repo" was not found`) {
		t.Errorf("wrong repo: %d %v", code, body)
	}

	s.GitHub.Repo = "repo"
	delete(gh.files, DataPath)
	if code, body := get(); code != 200 || body["data"] != nil {
		t.Errorf("missing file on a valid branch: %d %v", code, body)
	}
}

func TestFromEnvUsesVercelGitMetadata(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "correct horse battery")
	t.Setenv("SESSION_SECRET", strings.Repeat("x", 40))
	t.Setenv("GITHUB_TOKEN", "t")
	for _, k := range []string{"GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"} {
		t.Setenv(k, "")
	}
	t.Setenv("VERCEL_GIT_REPO_OWNER", "rifki")
	t.Setenv("VERCEL_GIT_REPO_SLUG", "site")
	t.Setenv("VERCEL_GIT_COMMIT_REF", "feature-x")
	s, err := FromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if g := s.GitHub; g.Owner != "rifki" || g.Repo != "site" || g.Branch != "feature-x" {
		t.Errorf("got %s/%s@%s", g.Owner, g.Repo, g.Branch)
	}
	if want := "owner from VERCEL_GIT_REPO_OWNER, repo from VERCEL_GIT_REPO_SLUG, branch from VERCEL_GIT_COMMIT_REF"; !strings.HasPrefix(s.GitHub.Origin, want) {
		t.Errorf("origin = %q, want prefix %q", s.GitHub.Origin, want)
	}

	t.Setenv("GITHUB_BRANCH", "main")
	if s, _ := FromEnv(); s.GitHub.Branch != "main" {
		t.Errorf("GITHUB_BRANCH should override, got %s", s.GitHub.Branch)
	}
}
