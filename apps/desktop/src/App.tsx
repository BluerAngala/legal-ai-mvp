import { useState } from "react";
import DocumentsPage from "./pages/DocumentsPage";
import SearchPage from "./pages/SearchPage";
import AnalysisPage from "./pages/AnalysisPage";
import TemplatesPage from "./pages/TemplatesPage";
import QAPage from "./pages/QAPage";

type Page = "documents" | "search" | "analysis" | "templates" | "qa";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("qa");

  const renderPage = () => {
    switch (currentPage) {
      case "documents":
        return <DocumentsPage />;
      case "search":
        return <SearchPage />;
      case "analysis":
        return <AnalysisPage />;
      case "templates":
        return <TemplatesPage />;
      case "qa":
        return <QAPage />;
      default:
        return <QAPage />;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>⚖️ LegalAI</h1>
        <nav className="nav">
          <button
            className={currentPage === "qa" ? "active" : ""}
            onClick={() => setCurrentPage("qa")}
          >
            🤖 问答
          </button>
          <button
            className={currentPage === "documents" ? "active" : ""}
            onClick={() => setCurrentPage("documents")}
          >
            📄 文档
          </button>
          <button
            className={currentPage === "search" ? "active" : ""}
            onClick={() => setCurrentPage("search")}
          >
            🔍 检索
          </button>
          <button
            className={currentPage === "analysis" ? "active" : ""}
            onClick={() => setCurrentPage("analysis")}
          >
            ⚖️ 分析
          </button>
          <button
            className={currentPage === "templates" ? "active" : ""}
            onClick={() => setCurrentPage("templates")}
          >
            📝 模板
          </button>
        </nav>
      </header>
      <main className="main">{renderPage()}</main>
    </div>
  );
}

export default App;
