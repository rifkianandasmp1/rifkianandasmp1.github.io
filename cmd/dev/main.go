// Command dev runs the portfolio locally the way Vercel serves it: static
// files from public/, the API from the backend package and the rewrites from
// vercel.json. Publishing from the local admin commits to the real repository.
//
//	go run ./cmd/dev                 # reads .env.local if present
//	go run ./cmd/dev -addr :8080 -env .env
package main

import (
	"bufio"
	"flag"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/rifkianandasmp1/portfolio/backend"
)

func main() {
	addr := flag.String("addr", "localhost:3000", "listen address")
	envFile := flag.String("env", ".env.local", "environment file to load (KEY=VALUE per line)")
	flag.Parse()

	if err := loadEnv(*envFile); err != nil && !os.IsNotExist(err) {
		log.Fatalf("load %s: %v", *envFile, err)
	}
	if _, err := backend.FromEnv(); err != nil {
		log.Printf("warning: API not configured (%v) — the admin will report it", err)
	}

	files := http.FileServer(http.Dir("public"))
	mux := http.NewServeMux()
	mux.Handle("/api/auth", backend.Serve(backend.Auth))
	mux.Handle("/api/content", backend.Serve(backend.Content))
	mux.Handle("/api/upload", backend.Serve(backend.Upload))
	mux.HandleFunc("/api/seo", backend.SEO)
	mux.HandleFunc("/robots.txt", rewrite("file=robots", backend.SEO))
	mux.HandleFunc("/sitemap.xml", rewrite("file=sitemap", backend.SEO))
	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/admin.html")
	})
	mux.Handle("/", files)

	log.Printf("portfolio: http://%s   admin: http://%s/admin", *addr, *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

func rewrite(query string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.URL.RawQuery = query
		h(w, r)
	}
}

func loadEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, set := os.LookupEnv(key); !set {
			os.Setenv(key, value)
		}
	}
	return sc.Err()
}
