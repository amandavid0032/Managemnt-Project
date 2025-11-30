import React from "react";
import { FaUserGraduate, FaChalkboardTeacher, FaSchool, FaMoneyBillWave, FaMapMarkerAlt, FaStar, FaGlobe } from "react-icons/fa";
import { MdOutlineAnnouncement } from "react-icons/md"; // Added for announcements
import { FiBookOpen } from "react-icons/fi"; // Added for courses

const HomePage = () => {
  const stats = [
    {
      id: 1,
      title: "Total Students",
      value: "12,540",
      icon: <FaUserGraduate className="text-blue-600 text-4xl" />,
      bg: "bg-blue-50",
    },
    {
      id: 2,
      title: "Active Teachers",
      value: "1,245",
      icon: <FaChalkboardTeacher className="text-green-600 text-4xl" />,
      bg: "bg-green-50",
    },
    {
      id: 3,
      title: "Campuses/Branches",
      value: "125",
      icon: <FaSchool className="text-yellow-600 text-4xl" />,
      bg: "bg-yellow-50",
    },
    {
      id: 4,
      title: "Avg. Review Score",
      value: "4.7/5",
      icon: <FaStar className="text-orange-600 text-4xl" />,
      bg: "bg-orange-50",
    },
  ];

  const quickActions = [
    { name: "Manage Students", image: "https://img.freepik.com/free-vector/student-character-collection_23-2148465716.jpg", link: "#", description: "Enroll, view, and update student profiles." },
    { name: "Hostel Management", image: "https://img.freepik.com/free-vector/hotel-building-concept-illustration_114360-8180.jpg", link: "#", description: "Oversee hostel bookings and allocations." },
    { name: "Fee & Payment", image: "https://img.freepik.com/free-vector/financial-transaction-concept-illustration_114360-1361.jpg", link: "#", description: "Handle fee collection and financial records." },
    { name: "Teacher Management", image: "https://img.freepik.com/free-vector/teacher-concept-illustration_114360-2236.jpg", link: "#", description: "Manage teacher profiles, schedules, and payroll." },
    { name: "Events & Notices", image: "https://img.freepik.com/free-vector/announcement-concept-illustration_114360-2367.jpg", link: "#", description: "Post announcements and manage upcoming events." },
    { name: "Course & Subject", image: "https://img.freepik.com/free-vector/open-book-pages-concept-illustration_114360-2443.jpg", link: "#", description: "Define and assign courses and subjects." },
    { name: "Admissions Portal", image: "https://img.freepik.com/free-vector/online-registration-concept-illustration_114360-2384.jpg", link: "#", description: "Process new student applications." },
    { name: "Library Management", image: "https://img.freepik.com/free-vector/flat-books-background_23-2147822004.jpg", link: "#", description: "Manage book inventory and borrowing." },
    { name: "Reports & Analytics", image: "https://img.freepik.com/free-vector/business-analytics-concept-illustration_114360-2350.jpg", link: "#", description: "Generate comprehensive reports." },
  ];

  const teacherThoughts = [
    {
      id: 1,
      teacher: "Ms. Sarah Chen",
      subject: "Mathematics",
      thought: "Today's calculus class was incredibly engaging! Students are really grasping the complex concepts. #MathIsFun #Learning",
      timestamp: "2 hours ago",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg"
    },
    {
      id: 2,
      teacher: "Mr. David Lee",
      subject: "Physics",
      thought: "Excited about the upcoming science fair projects. The creativity I'm seeing is inspiring! Let's build something great. #ScienceFair #Innovation",
      timestamp: "Yesterday",
      avatar: "https://randomuser.me/api/portraits/men/32.jpg"
    },
    {
      id: 3,
      teacher: "Dr. Anya Sharma",
      subject: "Literature",
      thought: "Discussing Shakespeare's 'Hamlet' always brings out such profound insights from students. Truly a timeless masterpiece. #Literature #Classic",
      timestamp: "2 days ago",
      avatar: "https://randomuser.me/api/portraits/women/68.jpg"
    },
  ];

  const schoolReviews = [
    {
      id: 1,
      student: "Aisha Khan",
      review: "The faculty here is incredibly supportive, and the facilities are top-notch! Really enjoying my time.",
      rating: 5,
      timestamp: "3 days ago"
    },
    {
      id: 2,
      student: "John Doe",
      review: "Great environment for learning, though sometimes the class sizes can be a bit large.",
      rating: 4,
      timestamp: "1 week ago"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-6 md:px-8 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-10">
        <h1 className="text-3xl font-extrabold text-blue-800 mb-2 sm:mb-0">EduSmart Campus Hub</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search schools by location..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FaMapMarkerAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300">
            Profile
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Overview and Quick Actions */}
        <div className="lg:col-span-2">
          {/* Overview Section */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Campus Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
              {stats.map((stat) => (
                <div
                  key={stat.id}
                  className={`p-6 rounded-xl shadow-md flex flex-col items-start ${stat.bg} hover:shadow-lg transition-shadow duration-300`}
                >
                  <div className="mb-3">{stat.icon}</div>
                  <p className="text-gray-600 text-sm font-medium">{stat.title}</p>
                  <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{stat.value}</h3>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Actions Section */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Quick Actions & Features</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-6">
              {quickActions.map((item, index) => (
                <a
                  key={index}
                  href={item.link}
                  className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transform hover:scale-105 transition-all duration-300 group"
                >
                  <img src={item.image} alt={item.name} className="w-full h-40 object-cover group-hover:opacity-85 transition-opacity duration-300" />
                  <div className="p-4 flex-grow flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800 mb-2">{item.name}</h3>
                      <p className="text-gray-600 text-sm">{item.description}</p>
                    </div>
                    <button className="mt-4 text-blue-600 hover:text-blue-800 font-medium self-end">
                      Go to {item.name.split(" ")[0]} &rarr;
                    </button>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column - Teacher Thoughts and School Reviews */}
        <div className="lg:col-span-1 flex flex-col space-y-8">
          {/* Teacher Social Feed / Thoughts */}
          <section className="bg-white rounded-xl shadow-lg p-6 flex-1">
            <h2 className="text-2xl font-bold mb-5 text-gray-800 flex items-center">
              <FaChalkboardTeacher className="mr-3 text-blue-600" /> Teacher's Corner
            </h2>
            <div className="space-y-6">
              {teacherThoughts.map((post) => (
                <div key={post.id} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center mb-2">
                    <img
                      src={post.avatar}
                      alt={post.teacher}
                      className="w-10 h-10 rounded-full mr-3 object-cover border-2 border-blue-400"
                    />
                    <div>
                      <p className="font-semibold text-gray-900">{post.teacher}</p>
                      <p className="text-sm text-gray-500">{post.subject} • {post.timestamp}</p>
                    </div>
                  </div>
                  <p className="text-gray-700 text-md leading-relaxed">{post.thought}</p>
                </div>
              ))}
            </div>
            <button className="mt-6 w-full bg-blue-50 text-blue-700 py-3 rounded-lg hover:bg-blue-100 transition duration-300 font-medium">
              View All Teacher Posts
            </button>
          </section>

          {/* School Information / Reviews */}
          <section className="bg-white rounded-xl shadow-lg p-6 flex-1">
            <h2 className="text-2xl font-bold mb-5 text-gray-800 flex items-center">
              <FaGlobe className="mr-3 text-green-600" /> Campus Info & Reviews
            </h2>
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Our Campus Highlights:</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-1">
                <li>State-of-the-art labs and classrooms</li>
                <li>Extensive library with digital resources</li>
                <li>Sports complex and recreational areas</li>
                <li>Career counseling and placement support</li>
              </ul>
            </div>
            <hr className="my-6 border-gray-200" />
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Latest Student Reviews:</h3>
            <div className="space-y-5">
              {schoolReviews.map((review) => (
                <div key={review.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-gray-800">{review.student}</p>
                    <div className="flex items-center text-yellow-500">
                      {[...Array(review.rating)].map((_, i) => (
                        <FaStar key={i} className="h-4 w-4" />
                      ))}
                      <span className="ml-1 text-gray-600 text-sm">({review.rating}/5)</span>
                    </div>
                  </div>
                  <p className="text-gray-700 text-sm italic">"{review.review}"</p>
                  <p className="text-xs text-gray-500 mt-2 text-right">{review.timestamp}</p>
                </div>
              ))}
            </div>
            <button className="mt-6 w-full bg-green-50 text-green-700 py-3 rounded-lg hover:bg-green-100 transition duration-300 font-medium">
              Read All Reviews
            </button>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-gray-600 py-6 bg-white shadow-inner mt-8">
        <p>© {new Date().getFullYear()} EduSmart Campus Hub. All Rights Reserved.</p>
        <p className="text-sm mt-1">Designed with <span className="text-red-500">&hearts;</span> for quality education.</p>
      </footer>
    </div>
  );
};

export default HomePage; 
