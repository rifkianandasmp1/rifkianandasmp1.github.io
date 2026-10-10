package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// GitHub is a minimal client for the GitHub Contents API.
type GitHub struct {
	Token  string
	Owner  string
	Repo   string
	Branch string

	BaseURL string       // defaults to https://api.github.com (overridden in tests)
	Client  *http.Client // defaults to a client with a 15s timeout
}

// File is a file read from the repository.
type File struct {
	Content []byte
	SHA     string
}

// Commit is the result of writing a file.
type Commit struct {
	SHA       string // blob sha of the new file
	CommitURL string
}

type ghError struct {
	status  int
	message string
}

func (e *ghError) Error() string { return fmt.Sprintf("GitHub error %d: %s", e.status, e.message) }

func (g *GitHub) client() *http.Client {
	if g.Client != nil {
		return g.Client
	}
	return &http.Client{Timeout: 15 * time.Second}
}

func (g *GitHub) baseURL() string {
	if g.BaseURL != "" {
		return strings.TrimRight(g.BaseURL, "/")
	}
	return "https://api.github.com"
}

func (g *GitHub) repoPath() string {
	return "/repos/" + url.PathEscape(g.Owner) + "/" + url.PathEscape(g.Repo)
}

func (g *GitHub) contentPath(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return g.repoPath() + "/contents/" + strings.Join(parts, "/")
}

func (g *GitHub) do(ctx context.Context, method, path string, body, out any) error {
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, g.baseURL()+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Authorization", "Bearer "+g.Token)
	req.Header.Set("User-Agent", "portfolio-admin")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := g.client().Do(req)
	if err != nil {
		return errorf(http.StatusBadGateway, "Cannot reach GitHub")
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		var e struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(res.Body).Decode(&e)
		return &ghError{status: res.StatusCode, message: e.Message}
	}
	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}

// toAPIError maps GitHub failures to responses for the admin client.
func toAPIError(err error) error {
	ge, ok := err.(*ghError)
	if !ok {
		return err
	}
	switch ge.status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return errorf(http.StatusBadGateway, "GitHub rejected the server token (check GITHUB_TOKEN and its Contents permission)")
	case http.StatusConflict, http.StatusUnprocessableEntity:
		return errorf(http.StatusConflict, "The file changed on GitHub while saving. Reload and try again.")
	default:
		return errorf(http.StatusBadGateway, ge.Error())
	}
}

// GetFile returns the file, or nil if it does not exist.
func (g *GitHub) GetFile(ctx context.Context, path string) (*File, error) {
	var meta struct {
		SHA     string `json:"sha"`
		Size    int    `json:"size"`
		Content string `json:"content"`
	}
	err := g.do(ctx, http.MethodGet, g.contentPath(path)+"?ref="+url.QueryEscape(g.Branch), nil, &meta)
	if ge, ok := err.(*ghError); ok && ge.status == http.StatusNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, toAPIError(err)
	}
	encoded := meta.Content
	if encoded == "" && meta.Size > 0 {
		// Files over 1 MB are not inlined by the contents API.
		var blob struct {
			Content string `json:"content"`
		}
		if err := g.do(ctx, http.MethodGet, g.repoPath()+"/git/blobs/"+meta.SHA, nil, &blob); err != nil {
			return nil, toAPIError(err)
		}
		encoded = blob.Content
	}
	content, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(encoded, "\n", ""))
	if err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}
	return &File{Content: content, SHA: meta.SHA}, nil
}

// PutFile creates (sha == "") or updates a file in one commit.
func (g *GitHub) PutFile(ctx context.Context, path string, content []byte, message, sha string) (*Commit, error) {
	body := map[string]string{
		"message": message,
		"content": base64.StdEncoding.EncodeToString(content),
		"branch":  g.Branch,
	}
	if sha != "" {
		body["sha"] = sha
	}
	var res struct {
		Content struct {
			SHA string `json:"sha"`
		} `json:"content"`
		Commit struct {
			HTMLURL string `json:"html_url"`
		} `json:"commit"`
	}
	if err := g.do(ctx, http.MethodPut, g.contentPath(path), body, &res); err != nil {
		return nil, toAPIError(err)
	}
	return &Commit{SHA: res.Content.SHA, CommitURL: res.Commit.HTMLURL}, nil
}
