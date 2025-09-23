# do-not-stop

> A full-stack Web3 authentication demo built with React, Node.js, and modern blockchain tools.

**do-not-stop** demonstrates a complete Web3 authentication flow: wallet connection → message signing → backend verification → JWT authentication → protected routes.

---

## 🚀 Features

* **React 19+ & TypeScript**: Cutting-edge frontend development with type safety and modern React patterns.
* **Vite**: Lightning-fast development and optimized builds.
* **Web3 Integration**:
  * **viem**: Lightweight Ethereum client for smart contract interactions.
  * **wagmi**: React hooks for seamless wallet and blockchain interactions.
* **Full-Stack Authentication**:
  * **Node.js Backend**: Express server with JWT authentication
  * **Message Signing**: Users sign messages to prove wallet ownership
  * **Signature Verification**: Backend verifies signatures using ethers.js
  * **Protected Routes**: JWT-protected API endpoints
* **Evolving Architecture**: Designed for continuous improvements, reflecting the fast-paced Web3 ecosystem.

---

## 💻 Getting Started

### Frontend (React)

1. **Clone the repo**
```bash
git clone https://github.com/heyradcode/do-not-stop.git
cd do-not-stop
```

2. **Set up environment variables**
```bash
cp env.example .env
# Edit .env if needed (default: http://localhost:3001)
```

3. **Install dependencies**
```bash
pnpm install
```

4. **Run the development server**
```bash
pnpm dev
```

5. **Open your browser**
```
http://localhost:5173
```

### Backend (Node.js)

1. **Navigate to backend directory**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp env.example .env
# Edit .env with your JWT secret
```

4. **Start the backend server**
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Complete Demo Flow

1. **Start both servers** (frontend on :5173, backend on :3001)
2. **Connect your wallet** (MetaMask, etc.)
3. **Click "Sign Message & Login"** to authenticate
4. **View protected content** that requires JWT authentication

---

## 🛠 Tech Stack

### Frontend
* **React 19+ & TypeScript**: Modern React with type safety
* **Vite**: Fast build tool and dev server
* **wagmi & viem**: Web3 wallet integration
* **CSS Modules**: Component-scoped styling

### Backend
* **Node.js & Express**: Server framework
* **JWT**: JSON Web Token authentication
* **ethers.js**: Ethereum signature verification
* **CORS**: Cross-origin resource sharing

---

## 🌱 Philosophy

**do-not-stop** demonstrates:

* Integration of Ethereum smart contracts into a React app.
* Modern React patterns with hooks, context, and state management.
* Continuous improvement mindset — evolving with the Web3 ecosystem.

This project is for personal use.

---

## 📝 License

MIT License © 2025 Rad Code
GitHub: [heyradcode](https://github.com/heyradcode)
