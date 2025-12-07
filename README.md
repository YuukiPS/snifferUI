# Packet Monitoring Dashboard

A modern, web-based dashboard for inspecting and monitoring network packets. Built with React, TypeScript, and Vite.

## 🚀 Features

- **Real-time Monitoring**: View a live feed of network packets with timestamp, source, and status.
- **Advanced Search**: Filter packets by Name, ID, or content within the JSON payload.
- **Deep Inspection**: detailed JSON viewer for inspecting complex packet data.
- **Responsive Design**: A modern, dark-themed UI optimized for readability and performance.
- **Mock Data Generation**: Integrated mock data generator for testing and development.

## 🛠 Tech Stack

- **Frontend Framework**: [React](https://react.dev/) (v19)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: Vanilla CSS with CSS Variables for theming

## 📦 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd snifferUI_Better
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5173`.

## 📜 Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the app for production.
- `npm run lint`: Runs ESLint to check for code quality issues.
- `npm run preview`: Previews the production build locally.

## 📂 Project Structure

```
snifferUI_Better/
├── src/
│   ├── components/      # Reusable UI components (PacketTable, PacketDetail, etc.)
│   ├── types/           # TypeScript interfaces and type definitions
│   ├── utils/           # Utility functions (Mock data generation)
│   ├── App.tsx          # Main application component
│   └── main.tsx         # Application entry point
├── public/              # Static assets
└── package.json         # Project dependencies and scripts
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.
