import React, { useEffect, useState } from "react";
import { FaSearch, FaGraduationCap } from "react-icons/fa";

/**
 * The search box is now wired to the API.
 *
 * It was previously an input with no value, no onChange and no handler — it
 * looked functional and did nothing. Institution search is a core product
 * capability and the v1 API supports it, so it is connected rather than
 * removed.
 */
const Header = ({ searchTerm, onSearchChange }) => {
  const [draft, setDraft] = useState(searchTerm ?? "");

  // Debounced: one request when typing settles, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== searchTerm) onSearchChange(draft.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, searchTerm, onSearchChange]);

  return (
    <header className="bg-white shadow-md py-4 px-6 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-50 gap-4">
      <h1 className="text-3xl font-extrabold text-blue-800 flex items-center gap-2">
        <FaGraduationCap />
        EduHub
      </h1>

      <form
        role="search"
        className="w-full sm:w-auto sm:flex-1 sm:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchChange(draft.trim());
        }}
      >
        <label htmlFor="institution-search" className="sr-only">
          Search institutions
        </label>
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="institution-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search institutions by name or city…"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>

      {/*
        No "Profile" button. Authentication exists in the API but there is no
        sign-in screen yet, so a button that goes nowhere would be exactly the
        kind of fake control this cleanup removed. It returns with the auth UI.
      */}
    </header>
  );
};

export default Header;
