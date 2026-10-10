package backend

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// SessionCookie is the name of the admin session cookie.
const SessionCookie = "admin_session"

const sessionTTL = 7 * 24 * time.Hour

type sessionPayload struct {
	Exp int64 `json:"exp"` // unix seconds
}

var b64 = base64.RawURLEncoding

func (s *Server) sign(payload string) string {
	mac := hmac.New(sha256.New, s.SessionSecret)
	mac.Write([]byte(payload))
	return b64.EncodeToString(mac.Sum(nil))
}

// equal compares two strings in constant time (independent of their lengths).
func equal(a, b string) bool {
	ha := sha256.Sum256([]byte(a))
	hb := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(ha[:], hb[:]) == 1
}

func (s *Server) checkPassword(password string) bool {
	return password != "" && equal(password, s.AdminPassword)
}

func (s *Server) newSessionCookie() *http.Cookie {
	exp := s.Now().Add(sessionTTL)
	raw, _ := json.Marshal(sessionPayload{Exp: exp.Unix()})
	payload := b64.EncodeToString(raw)
	return &http.Cookie{
		Name:     SessionCookie,
		Value:    payload + "." + s.sign(payload),
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}
}

func clearedSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}
}

func (s *Server) hasValidSession(r *http.Request) bool {
	c, err := r.Cookie(SessionCookie)
	if err != nil {
		return false
	}
	payload, signature, ok := strings.Cut(c.Value, ".")
	if !ok || !equal(signature, s.sign(payload)) {
		return false
	}
	raw, err := b64.DecodeString(payload)
	if err != nil {
		return false
	}
	var p sessionPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return false
	}
	return p.Exp > s.Now().Unix()
}

func (s *Server) requireSession(r *http.Request) error {
	if !s.hasValidSession(r) {
		return errorf(http.StatusUnauthorized, "Not signed in")
	}
	return nil
}
