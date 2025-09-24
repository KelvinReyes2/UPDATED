import React from "react";
import ReactDOM from "react-dom/client"; // for React 18+
import App from "./App";

// React 18 way to create root and render
const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
