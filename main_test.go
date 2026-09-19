package main

import (
	"bytes"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestAuthentication(t *testing.T) {
	s := &store{users: make(map[string][]byte)}
	cases := []struct {
		name     string
		register bool
		body     string
		status   int
	}{
		{"empty", true, `{"username":" ","password":"x"}`, 400},
		{"invalid JSON", true, `{`, 400},
		{"trailing JSON", true, `{"username":"a","password":"x"}{}`, 400},
		{"register", true, `{"username":"alice","password":"test-pass"}`, 201},
		{"duplicate", true, `{"username":"alice","password":"other"}`, 409},
		{"missing account", false, `{"username":"nobody","password":"test-pass"}`, 404},
		{"wrong password", false, `{"username":"alice","password":"wrong"}`, 401},
		{"correct password", false, `{"username":"alice","password":"test-pass"}`, 200},
		{"second account same password", true, `{"username":"bob","password":"test-pass"}`, 201},
		{"oversize password", true, `{"username":"long","password":"` + strings.Repeat("x", 73) + `"}`, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			s.auth(tc.register)(w, httptest.NewRequest("POST", "/", strings.NewReader(tc.body)))
			if w.Code != tc.status {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
		})
	}
	if bytes.Equal(s.users["alice"], []byte("test-pass")) {
		t.Fatal("plaintext stored")
	}
	if bytes.Equal(s.users["alice"], s.users["bob"]) {
		t.Fatal("same passwords must use different salts")
	}
	if bcrypt.CompareHashAndPassword(s.users["alice"], []byte("test-pass")) != nil {
		t.Fatal("hash cannot be verified")
	}
	w := httptest.NewRecorder()
	s.auth(true)(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 405 {
		t.Fatal("GET must be rejected")
	}
}

func TestConcurrentRegistration(t *testing.T) {
	s := &store{users: make(map[string][]byte)}
	statuses := make(chan int, 4)
	var group sync.WaitGroup
	for i := 0; i < 4; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			w := httptest.NewRecorder()
			s.auth(true)(w, httptest.NewRequest("POST", "/", strings.NewReader(`{"username":"same","password":"test-pass"}`)))
			statuses <- w.Code
		}()
	}
	group.Wait()
	close(statuses)
	successes := 0
	for status := range statuses {
		if status == 201 {
			successes++
		} else if status != 409 {
			t.Fatalf("unexpected status %d", status)
		}
	}
	if successes != 1 {
		t.Fatalf("expected exactly one new account, got %d", successes)
	}
}
