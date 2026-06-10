package solana

// WebSocket transport. The wsConn interface is the test seam: the real
// implementation wraps gorilla/websocket with keepalive pings and read
// deadlines; tests inject a scripted fake so no sockets are opened (real
// listeners deadlock on close on windows/386 — see the evm package tests).

import (
	"context"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	pingEvery    = 20 * time.Second
	readDeadline = 90 * time.Second
	writeTimeout = 10 * time.Second
)

type wsConn interface {
	// ReadMessage blocks until a text frame, an error, or Close.
	ReadMessage() ([]byte, error)
	WriteJSON(v any) error
	Close() error
}

type wsDialer func(ctx context.Context, url string) (wsConn, error)

// gorillaConn adds the keepalive loop and write serialization gorilla
// requires (one concurrent writer).
type gorillaConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
	done    chan struct{}
	once    sync.Once
}

func dialGorilla(ctx context.Context, url string) (wsConn, error) {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, url, nil)
	if err != nil {
		return nil, err
	}

	g := &gorillaConn{conn: conn, done: make(chan struct{})}
	_ = conn.SetReadDeadline(time.Now().Add(readDeadline))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(readDeadline))
	})
	go g.pingLoop()
	return g, nil
}

func (g *gorillaConn) pingLoop() {
	ticker := time.NewTicker(pingEvery)
	defer ticker.Stop()
	for {
		select {
		case <-g.done:
			return
		case <-ticker.C:
			g.writeMu.Lock()
			err := g.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeTimeout))
			g.writeMu.Unlock()
			if err != nil {
				return // read loop will surface the failure
			}
		}
	}
}

func (g *gorillaConn) ReadMessage() ([]byte, error) {
	_, msg, err := g.conn.ReadMessage()
	if err == nil {
		_ = g.conn.SetReadDeadline(time.Now().Add(readDeadline))
	}
	return msg, err
}

func (g *gorillaConn) WriteJSON(v any) error {
	g.writeMu.Lock()
	defer g.writeMu.Unlock()
	_ = g.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return g.conn.WriteJSON(v)
}

func (g *gorillaConn) Close() error {
	g.once.Do(func() { close(g.done) })
	return g.conn.Close()
}
