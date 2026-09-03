import React from 'react';
import { exploreCategories } from '../dummyData/exploreData';

const CategoryTabs = ({ selectedCategory, onSelect }) => {
    return (
        <div className="flex items-center gap-3 overflow-x-auto px-6 py-4 no-scrollbar">
            {exploreCategories.map((category) => (
                <button
                    key={category}
                    onClick={() => onSelect(category)}
                    className={`whitespace-nowrap px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 border ${
                        selectedCategory === category
                            ? 'bg-primary-600 text-white border-primary-600 shadow-md scale-105'
                            : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200'
                    }`}
                >
                    {category}
                </button>
            ))}
        </div>
    );
};

export default CategoryTabs;
