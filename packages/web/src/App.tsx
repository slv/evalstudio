import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProjectLayout } from "./components/ProjectLayout";
import { ProjectRedirect } from "./components/ProjectRedirect";
import { StatusBar } from "./components/StatusBar";
import { DashboardPage } from "./pages/DashboardPage";
import { EvalsPage } from "./pages/EvalsPage";
import { EvalDetailPage } from "./pages/EvalDetailPage";
import { ScenariosPage } from "./pages/ScenariosPage";
import { ScenarioDetailPage } from "./pages/ScenarioDetailPage";
import { PersonasPage } from "./pages/PersonasPage";
import { PersonaDetailPage } from "./pages/PersonaDetailPage";
import { AgentsPage } from "./pages/AgentsPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { SettingsGeneralPage } from "./pages/SettingsGeneralPage";
import { SettingsLLMProvidersPage } from "./pages/SettingsLLMProvidersPage";
import { SettingsUsersPage } from "./pages/SettingsUsersPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root redirects to the first project */}
        <Route index element={<ProjectRedirect />} />

        {/* Project-scoped routes */}
        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="evals" element={<EvalsPage />} />
          <Route path="evals/:evalId" element={<EvalDetailPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="scenarios" element={<ScenariosPage />} />
          <Route path="scenarios/:scenarioId" element={<ScenarioDetailPage />} />
          <Route path="personas" element={<PersonasPage />} />
          <Route path="personas/:personaId" element={<PersonaDetailPage />} />
          <Route path="settings/general" element={<SettingsGeneralPage />} />
          <Route path="settings/connectors" element={<Navigate to="../agents" replace />} />
          <Route path="settings/llm-providers" element={<SettingsLLMProvidersPage />} />
          <Route path="settings/users" element={<SettingsUsersPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <StatusBar />
    </BrowserRouter>
  );
}
