import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "../pages/HomePage";
import CollegesPage from "../pages/CollegesPage";
import SchoolsPage from "../pages/SchoolsPage";
import TeachersPage from "../pages/TeachersPage";
import NotFoundPage from "../pages/NotFoundPage";

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/colleges" element={<CollegesPage />} />
      <Route path="/schools" element={<SchoolsPage />} />
      <Route path="/teachers" element={<TeachersPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </BrowserRouter>
);

export default AppRoutes;
