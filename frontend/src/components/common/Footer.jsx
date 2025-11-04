import React from "react";

const Footer = () => {
  return (
    <footer className="text-center text-gray-600 py-6 bg-white shadow-inner mt-10">
      <p>© {new Date().getFullYear()} EduSmart Learning Hub. All Rights Reserved.</p>
      <p className="text-sm mt-1">
        Designed with <span className="text-red-500">❤️</span> for education.
      </p>
    </footer>
  );
};

export default Footer;
