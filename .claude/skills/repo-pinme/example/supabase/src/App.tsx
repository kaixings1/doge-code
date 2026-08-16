import { Routes, Route, HashRouter } from "react-router-dom";
import Home from "./pages/Home";
import "./App.css";

const App = (): JSX.Element => {
  return (
    <div className="app">
      <div className="main-content">
        <HashRouter>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </HashRouter>
      </div>
    </div>
  );
};

export default App;
