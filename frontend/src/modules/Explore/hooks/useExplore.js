import { useState, useMemo } from 'react';
import { mockProducts, mockCreators } from '../dummyData/exploreData';

export const useExplore = () => {
    const [selectedCategory, setSelectedCategory] = useState('All');

    const filteredProducts = useMemo(() => {
        if (selectedCategory === 'All') return mockProducts;
        return mockProducts.filter(product => product.category === selectedCategory);
    }, [selectedCategory]);

    return {
        selectedCategory,
        setSelectedCategory,
        products: filteredProducts,
        creators: mockCreators // Creators are usually not filtered by category in Explore
    };
};

