import React from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import App from "./app/App";
import "@fontsource-variable/inter";
import "./styles.css";

const chakraTheme = extendTheme({
  config: { initialColorMode: "light", useSystemColorMode: false },
  fonts: { heading: "var(--font)", body: "var(--font)" },
  styles: { global: { body: { bg: "var(--bg)", color: "var(--ink)" } } },
});

const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#d9703a", contrastText: "#fffdf9" },
    secondary: { main: "#d9577e" },
    success: { main: "#5e8c4f" },
    warning: { main: "#f0a020" },
    error: { main: "#c2410c" },
    text: { primary: "#2b2118", secondary: "#8a7663" },
    divider: "#eadccb",
    background: { default: "#fbf6ee", paper: "#fffdf9" },
  },
  shape: { borderRadius: 14 },
  typography: { fontFamily: "var(--font)" },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChakraProvider theme={chakraTheme}>
      <ThemeProvider theme={muiTheme}>
        <App />
      </ThemeProvider>
    </ChakraProvider>
  </React.StrictMode>,
);
