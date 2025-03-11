# AI Planner

AI Planner is a modern web application that combines the power of AI with calendar management to help users schedule their tasks and events efficiently. The application features a chat-like interface for natural language input and a responsive calendar display.


## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Ollama (for AI functionality)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ai-planner.git
cd ai-planner
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up Ollama:
- Install Ollama from [ollama.ai](https://ollama.ai)
- Pull the required model:
```bash
ollama pull llama2
```

4. Start the development server:
```bash
npm run dev
# or
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_OLLAMA_API_URL=http://localhost:11434
```

## Project Structure

```
ai-planner/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── ollama/
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── services/
│   │   ├── ai.ts
│   │   └── ollama.ts
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── globals.css
├── public/
├── package.json
└── README.md
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
