/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { Starfield } from "./pages/Starfield";
import { Chronicle } from "./pages/Chronicle";
import { Resonance } from "./pages/Resonance";
import { Onboarding } from "./pages/Onboarding";
import { Discover } from "./pages/Discover";
import { useStore } from "./store/useStore";

export default function App() {
  const onboardingComplete = useStore((s) => s.onboardingComplete);

  return (
    <Router>
      <div className="w-full min-h-screen bg-void text-white font-sans">
        {onboardingComplete && <TopBar />}
        <Routes>
          {/* If onboarding not done, always redirect to /onboarding */}
          <Route
            path="/onboarding"
            element={<Onboarding />}
          />
          <Route
            path="/"
            element={
              onboardingComplete ? <Starfield /> : <Navigate to="/onboarding" replace />
            }
          />
          <Route
            path="/discover"
            element={
              onboardingComplete ? <Discover /> : <Navigate to="/onboarding" replace />
            }
          />
          <Route
            path="/chronicle"
            element={
              onboardingComplete ? <Chronicle /> : <Navigate to="/onboarding" replace />
            }
          />
          <Route
            path="/resonance"
            element={
              onboardingComplete ? <Resonance /> : <Navigate to="/onboarding" replace />
            }
          />
        </Routes>
      </div>
    </Router>
  );
}
