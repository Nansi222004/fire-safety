import React from 'react';
import { FiPlus } from 'react-icons/fi';

const PopularCreators = ({ creators }) => {
    return (
        <div className="flex items-center gap-6 overflow-x-auto px-6 py-4 no-scrollbar">
            {creators.map((creator) => (
                <div key={creator.id} className="flex flex-col items-center gap-2 min-w-[80px]">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600">
                            <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-gray-200">
                                <img 
                                    src={creator.avatar} 
                                    alt={creator.name} 
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                        <button className="absolute -bottom-1 -right-1 bg-primary-600 text-white p-1 rounded-full border-2 border-white shadow-sm">
                            <FiPlus size={10} strokeWidth={4} />
                        </button>
                    </div>
                    <div className="text-center">
                        <p className="text-[10px] font-black text-gray-900 leading-tight truncate w-20 uppercase tracking-tighter">
                            {creator.name}
                        </p>
                        <p className="text-[8px] font-bold text-gray-400">{creator.followers}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PopularCreators;
