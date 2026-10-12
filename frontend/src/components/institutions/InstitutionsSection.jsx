import React, { useRef } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import InstitutionCard from "./InstitutionCard";
import useInstitutions from "../../hooks/useInstitutions";

/**
 * One horizontally-scrolling section of institutions.
 *
 * Replaces the near-identical SchoolsSection and CollegesSection, which
 * differed only in a hardcoded category string and a heading.
 */
const InstitutionsSection = ({ title, subtitle, category, search }) => {
  const { items, loading, loadingMore, error, hasNext, total, loadMore, retry } =
    useInstitutions({ category, search });

  const scrollRef = useRef(null);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{title}</h2>
            <p className="text-gray-600 text-sm sm:text-base">
              {subtitle}
              {!loading && !error && total > 0 && (
                <span className="text-gray-500"> · {total} found</span>
              )}
            </p>
          </div>

          {items.length > 0 && (
            <div className="flex gap-2 mt-4 sm:mt-0">
              <button
                type="button"
                aria-label={`Scroll ${title} left`}
                onClick={() => scroll("left")}
                className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition"
              >
                <FaChevronLeft />
              </button>
              <button
                type="button"
                aria-label={`Scroll ${title} right`}
                onClick={() => scroll("right")}
                className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition"
              >
                <FaChevronRight />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          // Skeletons matching the real card dimensions, so the layout does
          // not jump when data arrives.
          <div className="flex gap-6 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] h-[340px] bg-white rounded-lg shadow-md animate-pulse"
              >
                <div className="w-full h-48 sm:h-52 md:h-56 bg-gray-200 rounded-t-lg" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700 mb-3">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            No institutions found{search ? ` matching “${search}”` : ""}.
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
          >
            {items.map((institution) => (
              <div
                key={institution.id}
                className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px]"
              >
                <InstitutionCard institution={institution} />
              </div>
            ))}

            {/*
              Shown only when the SERVER reports another page. The previous
              version always offered "Show More" while the API was capped at
              50 records, so the control frequently did nothing.
            */}
            {hasNext && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] bg-blue-50 rounded-2xl shadow-md flex items-center justify-center cursor-pointer hover:bg-blue-100 transition disabled:opacity-60"
              >
                <span className="text-blue-600 font-semibold">
                  {loadingMore ? "Loading…" : "Show More →"}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default InstitutionsSection;
