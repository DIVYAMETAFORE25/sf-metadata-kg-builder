import { Navigate, Route, Routes } from "react-router-dom";
import Overview from "./pages/Overview";
import UploadPage from "./pages/Upload";
import MetadataParser from "./pages/MetadataParser";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import StagePlaceholder from "./pages/StagePlaceholder";
import InfoPage from "./pages/InfoPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/parser" element={<MetadataParser />} />
      <Route path="/canonical" element={<StagePlaceholder stageId="canonical" />} />
      <Route
        path="/relationships"
        element={<StagePlaceholder stageId="relationships" />}
      />
      <Route
        path="/classification"
        element={<StagePlaceholder stageId="classification" />}
      />
      <Route path="/graph" element={<KnowledgeGraph />} />
      <Route
        path="/validation"
        element={<StagePlaceholder stageId="validation" />}
      />
      <Route path="/brd" element={<StagePlaceholder stageId="brd" />} />
      <Route path="/docs" element={<InfoPage variant="docs" />} />
      <Route path="/settings" element={<InfoPage variant="settings" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
