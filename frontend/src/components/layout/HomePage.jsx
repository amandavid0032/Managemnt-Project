import React from "react";
import Header from "../common/Header";
import Footer from "../common/Footer";
import SchoolsSection from "../schools/SchoolsSection";
import CollegesSection from "../collage/CollegesSection";
import StudentProjectsSection from "../students/StudentProjectsSection";
import TeachersSection from "../teachers/TeachersSection";

const HomePage = () => {
  return (
    <div className="bg-gray-100 min-h-screen">
      <Header />
      <main className="px-6 md:px-10 py-8 space-y-12">
        <SchoolsSection />
        <CollegesSection />
        <StudentProjectsSection />
        <TeachersSection />
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
