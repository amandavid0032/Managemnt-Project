import React from "react";

const Footer = () => (
  <footer className="text-center text-gray-600 py-6 bg-white shadow-inner mt-10">
    <p>© {new Date().getFullYear()} EduHub. All rights reserved.</p>
    <p className="text-sm mt-1">Discover schools and colleges worldwide.</p>
  </footer>
);

export default Footer;
