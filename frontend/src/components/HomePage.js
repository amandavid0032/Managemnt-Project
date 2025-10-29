import React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

const HomePage = () => {
  return (
    <div>
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-light text-white bg-dark">
        <a className="navbar-brand text-white" href="#">
          Dream Property
        </a>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarSupportedContent"
          aria-controls="navbarSupportedContent"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarSupportedContent">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item active">
              <a className="nav-link text-white" href="#">
                Home
              </a>
            </li>
            <li className="nav-item">
              <a className="nav-link text-white" href="#">
                Link
              </a>
            </li>
            <li className="nav-item dropdown">
              <a
                className="nav-link dropdown-toggle text-white"
                href="#"
                id="navbarDropdown"
                role="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                Dropdown
              </a>
              <ul className="dropdown-menu" aria-labelledby="navbarDropdown">
                <li>
                  <a className="dropdown-item" href="#">
                    Action
                  </a>
                </li>
                <li>
                  <a className="dropdown-item" href="#">
                    Another action
                  </a>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <a className="dropdown-item" href="#">
                    Something else here
                  </a>
                </li>
              </ul>
            </li>
            <li className="nav-item">
              <a className="nav-link disabled text-secondary" href="#">
                Disabled
              </a>
            </li>
          </ul>
          <form className="d-flex" role="search">
            <input
              className="form-control me-2"
              type="search"
              placeholder="Search"
              aria-label="Search"
            />
            <button className="btn btn-outline-success" type="submit">
              Search
            </button>
          </form>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section text-center py-5 bg-light">
        <div className="container">
          <h1 className="display-4">Find Your Dream Property</h1>
          <p className="lead">
            Explore the best properties for rent and sale across various
            locations.
          </p>
          <a href="#properties-for-sale" className="btn btn-primary btn-lg me-2">
            Buy Now
          </a>
          <a href="#properties-for-rent" className="btn btn-outline-primary btn-lg">
            Rent Now
          </a>
        </div>
      </section>

      {/* Carousel Section */}
      <section className="container my-5">
        <div id="propertyCarousel" className="carousel slide" data-bs-ride="carousel">
          <div className="carousel-inner">
            {[
              {
                img: "https://images.unsplash.com/photo-1560518883-ffcd1f887600?q=80&w=2070&auto=format&fit=crop",
                title: "Luxury Living",
                desc: "Discover homes that redefine comfort and elegance.",
              },
              {
                img: "https://images.unsplash.com/photo-1600585152220-90807028b894?q=80&w=2070&auto=format&fit=crop",
                title: "Spacious Interiors",
                desc: "Perfect spaces for your family to grow and thrive.",
              },
              {
                img: "https://images.unsplash.com/photo-1580587771746-d1309d943486?q=80&w=2070&auto=format&fit=crop",
                title: "Urban Convenience",
                desc: "Live in the heart of the city with all amenities nearby.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className={`carousel-item ${index === 0 ? "active" : ""}`}
              >
                <img src={item.img} className="d-block w-100" alt={item.title} />
                <div className="carousel-caption d-none d-md-block">
                  <h5>{item.title}</h5>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            className="carousel-control-prev"
            type="button"
            data-bs-target="#propertyCarousel"
            data-bs-slide="prev"
          >
            <span className="carousel-control-prev-icon" aria-hidden="true"></span>
            <span className="visually-hidden">Previous</span>
          </button>
          <button
            className="carousel-control-next"
            type="button"
            data-bs-target="#propertyCarousel"
            data-bs-slide="next"
          >
            <span className="carousel-control-next-icon" aria-hidden="true"></span>
            <span className="visually-hidden">Next</span>
          </button>
        </div>
      </section>

      {/* Properties for Sale */}
      <section id="properties-for-sale" className="py-5 bg-white">
        <div className="container">
          <h2 className="text-center mb-4">Properties for Sale</h2>
          <div className="row row-cols-1 row-cols-md-3 g-4">
            {[
              {
                img: "https://images.unsplash.com/photo-1570129476722-e1ae600e1276?q=80&w=2070&auto=format&fit=crop",
                title: "Modern Family Home",
                desc: "Spacious 4-bedroom house with a large backyard, perfect for families.",
                price: "$550,000",
              },
              {
                img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop",
                title: "Downtown Condo",
                desc: "Stylish 2-bedroom, 2-bathroom condo in the heart of the city.",
                price: "$320,000",
              },
              {
                img: "https://images.unsplash.com/photo-1582053433362-e61ef0a4ac77?q=80&w=2070&auto=format&fit=crop",
                title: "Luxury Villa with Pool",
                desc: "Exquisite villa featuring 5 bedrooms, a private pool, and great views.",
                price: "$1,200,000",
              },
            ].map((property, i) => (
              <div className="col" key={i}>
                <div className="card h-100 shadow-sm">
                  <img src={property.img} className="card-img-top" alt={property.title} />
                  <div className="card-body">
                    <h5 className="card-title">{property.title}</h5>
                    <p className="card-text">{property.desc}</p>
                    <p className="card-text fw-bold">{property.price}</p>
                    <a href="#" className="btn btn-primary">
                      View Details
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="call-to-action text-center py-5 bg-primary text-white">
        <div className="container">
          <h2 className="mb-3">Ready to find your next home?</h2>
          <p className="lead">Contact us today to speak with a real estate expert!</p>
          <a href="/contact" className="btn btn-light btn-lg">
            Contact Us
          </a>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
