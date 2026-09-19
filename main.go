package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// store 只保存密码哈希；本学习项目重启后账号会清空。
type store struct {
	mu    sync.Mutex
	users map[string][]byte
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func reply(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}

func (s *store) auth(register bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			reply(w, http.StatusMethodNotAllowed, "请使用 POST 请求")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		defer r.Body.Close()
		var input credentials
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
			reply(w, http.StatusBadRequest, "请求格式不正确")
			return
		}
		input.Username = strings.TrimSpace(input.Username)
		if input.Username == "" || strings.TrimSpace(input.Password) == "" {
			reply(w, http.StatusBadRequest, "账号和密码不能为空")
			return
		}
		if len([]rune(input.Username)) > 40 || len(input.Password) > 72 {
			reply(w, http.StatusBadRequest, "账号最多 40 个字符，密码最多 72 个 UTF-8 字节")
			return
		}
		if register {
			s.register(w, input)
		} else {
			s.login(w, input)
		}
	}
}

func (s *store) register(w http.ResponseWriter, input credentials) {
	_, exists := s.findUser(input.Username)

	if exists {
		reply(w, http.StatusConflict, "账号已存在，请更换账号或直接登录")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		reply(w, http.StatusInternalServerError, "注册暂时失败，请稍后重试")
		return
	}
	// 再次检查，避免两个同时到达的注册请求覆盖同一账号。
	s.mu.Lock()
	_, exists = s.users[input.Username]
	if !exists {
		s.users[input.Username] = newHash
	}
	s.mu.Unlock()
	if exists {
		reply(w, http.StatusConflict, "账号已存在，请更换账号或直接登录")
		return
	}
	reply(w, http.StatusCreated, "注册成功！现在可以登录了")
}

func (s *store) login(w http.ResponseWriter, input credentials) {
	hash, exists := s.findUser(input.Username)

	if !exists {
		reply(w, http.StatusNotFound, "账号不存在，请先注册")
		return
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(input.Password)) != nil {
		reply(w, http.StatusUnauthorized, "密码错误，请重新输入")
		return
	}
	reply(w, http.StatusOK, "登录成功，欢迎回来！")
}

func (s *store) findUser(username string) ([]byte, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	hash, exists := s.users[username]
	return hash, exists
}

func main() {
	s := &store{users: make(map[string][]byte)}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/register", s.auth(true))
	mux.HandleFunc("/api/login", s.auth(false))
	mux.Handle("/", http.FileServer(http.Dir("web")))
	server := &http.Server{
		Addr:              "127.0.0.1:8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	fmt.Println("打开 http://127.0.0.1:8080 （Ctrl+C 停止；重启清空）")
	log.Fatal(server.ListenAndServe())
}
