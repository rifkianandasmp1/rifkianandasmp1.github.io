// Package backend implements the private admin API of the portfolio.
//
// It is deployed as Vercel Go Functions (see api/*/index.go) and can also run
// locally through cmd/dev. Content lives in the GitHub repository; the server
// commits changes with a token that never leaves the server.
package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	// DataPath is the content file inside the repository.
	DataPath = "public/data/portfolio.json"
	// ImageDir is where uploaded images are committed; it is served as /images.
	ImageDir = "public/images"

	maxContentBody = 512 << 10 // 512 KiB
	maxImageBytes  = 3 << 20   // 3 MiB
)

// jakarta is used for the "last updated" date. A fixed zone avoids depending on
// tzdata being present in the serverless runtime.
var jakarta = time.FixedZone("WIB", 7*60*60)

// Server holds configuration shared by all handlers.
type Server struct {
	AdminPassword string
	SessionSecret []byte
	GitHub        *GitHub

	// Hooks for tests.
	Now          func() time.Time
	LoginFailure time.Duration // delay after a wrong password
}

// FromEnv builds a Server from environment variables.
//
// On Vercel the repository and branch default to the deployment's own Git
// metadata (VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG, VERCEL_GIT_COMMIT_REF),
// so production publishes to its branch and each preview to the preview's
// branch. GITHUB_OWNER, GITHUB_REPO and GITHUB_BRANCH override them.
func FromEnv() (*Server, error) {
	var missing []string
	env := func(names ...string) string {
		for _, n := range names {
			if v := strings.TrimSpace(os.Getenv(n)); v != "" {
				return v
			}
		}
		return ""
	}
	require := func(name string, fallbacks ...string) string {
		v := env(append([]string{name}, fallbacks...)...)
		if v == "" {
			missing = append(missing, name)
		}
		return v
	}
	s := &Server{
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		SessionSecret: []byte(os.Getenv("SESSION_SECRET")),
		GitHub: &GitHub{
			Token:  require("GITHUB_TOKEN"),
			Owner:  require("GITHUB_OWNER", "VERCEL_GIT_REPO_OWNER"),
			Repo:   require("GITHUB_REPO", "VERCEL_GIT_REPO_SLUG"),
			Branch: env("GITHUB_BRANCH", "VERCEL_GIT_COMMIT_REF"),
			// Optional, for GitHub Enterprise or a local fake API.
			BaseURL: env("GITHUB_API_URL"),
		},
		Now:          time.Now,
		LoginFailure: 800 * time.Millisecond,
	}
	if len(s.AdminPassword) < 8 {
		missing = append(missing, "ADMIN_PASSWORD (min 8 characters)")
	}
	if len(s.SessionSecret) < 32 {
		missing = append(missing, "SESSION_SECRET (min 32 characters)")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing or invalid: %s", strings.Join(missing, ", "))
	}
	if s.GitHub.Branch == "" {
		s.GitHub.Branch = "main"
	}
	return s, nil
}

// Endpoint handles one API route using the shared Server configuration.
type Endpoint func(s *Server, w http.ResponseWriter, r *http.Request) error

// Serve turns an Endpoint into an http.HandlerFunc that loads configuration
// from the environment and renders errors as JSON.
func Serve(e Endpoint) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s, err := FromEnv()
		if err != nil {
			writeError(w, errorf(http.StatusInternalServerError, "Server is not configured: "+err.Error()))
			return
		}
		s.Handle(e)(w, r)
	}
}

// Handle runs an Endpoint on an existing Server (used by tests and cmd/dev).
func (s *Server) Handle(e Endpoint) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := e(s, w, r); err != nil {
			writeError(w, err)
		}
	}
}

func methodNotAllowed(w http.ResponseWriter, allowed ...string) error {
	w.Header().Set("Allow", strings.Join(allowed, ", "))
	return errorf(http.StatusMethodNotAllowed, "Method not allowed")
}

func requestHost(r *http.Request) string {
	if h := r.Header.Get("X-Forwarded-Host"); h != "" {
		return h
	}
	return r.Host
}

// assertSameOrigin blocks cross-site requests to state-changing endpoints
// (CSRF defence on top of the SameSite=Strict cookie).
func assertSameOrigin(r *http.Request) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return errorf(http.StatusForbidden, "Missing Origin header")
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return errorf(http.StatusForbidden, "Invalid Origin header")
	}
	if u.Host != requestHost(r) {
		return errorf(http.StatusForbidden, "Cross-origin request blocked")
	}
	return nil
}

// readJSON decodes a JSON request body with a size limit.
func readJSON(w http.ResponseWriter, r *http.Request, limit int64, dst any) error {
	if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
		return errorf(http.StatusUnsupportedMediaType, "Expected application/json")
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		return errorf(http.StatusRequestEntityTooLarge, "Request body too large")
	}
	if err := json.Unmarshal(body, dst); err != nil {
		return errorf(http.StatusBadRequest, "Invalid JSON")
	}
	return nil
}

func siteOrigin(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "http"
		if r.TLS != nil {
			proto = "https"
		}
	}
	return proto + "://" + requestHost(r)
}
