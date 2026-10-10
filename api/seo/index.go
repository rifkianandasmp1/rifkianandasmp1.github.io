// Vercel Go Function for /robots.txt and /sitemap.xml (rewritten to /api/seo).
package handler

import (
	"net/http"

	"github.com/rifkianandasmp1/portfolio/backend"
)

func Handler(w http.ResponseWriter, r *http.Request) { backend.SEO(w, r) }
