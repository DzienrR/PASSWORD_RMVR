import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import PdfUnlocker from "@/pages/PdfUnlocker";

function App() {
  return (
    <div className="App">
      <div className="swiss-bg" aria-hidden="true" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PdfUnlocker />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: 0,
            border: "1px solid #0A0A0A",
            fontFamily: "'IBM Plex Sans', sans-serif",
          },
        }}
      />
    </div>
  );
}

export default App;
