import React, { useCallback, useState } from "react";
import Header from "../common/Header";
import Footer from "../common/Footer";
import InstitutionsSection from "../institutions/InstitutionsSection";

/**
 * Search state is owned here and passed down, so one search box drives every
 * section. Each section requests its own category from the API.
 */
const HomePage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const handleSearchChange = useCallback((value) => setSearchTerm(value), []);

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header searchTerm={searchTerm} onSearchChange={handleSearchChange} />

      <main className="flex-1 px-2 md:px-6 py-4">
        {searchTerm ? (
          // While searching, category sections would fragment the results, so
          // a single unfiltered result list is shown instead.
          <InstitutionsSection
            title="Search Results"
            subtitle={`Institutions matching “${searchTerm}”`}
            search={searchTerm}
          />
        ) : (
          <>
            <InstitutionsSection
              title="Top Schools"
              subtitle="Explore leading schools worldwide"
              category="SCHOOL"
            />
            <InstitutionsSection
              title="Colleges & Universities"
              subtitle="Higher education institutions"
              category="UNIVERSITY"
            />
            <InstitutionsSection
              title="Polytechnics & Institutes"
              subtitle="Technical and vocational education"
              category="POLYTECHNIC"
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;
