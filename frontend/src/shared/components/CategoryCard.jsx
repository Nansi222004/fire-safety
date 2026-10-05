import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const CategoryCard = ({ category }) => {
  const categoryLink = `/category/${category.id}`;

  return (
    <Link to={categoryLink} className="block h-full">
      <motion.div
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass-card rounded-2xl overflow-hidden cursor-pointer sf-card-lift group h-full flex flex-col border border-slate-200/80 hover:border-slate-300 hover:shadow-xl transition-all duration-300">
        <div className="w-full h-24 md:h-32 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center overflow-hidden relative">
          <img
            src={category.image}
            alt={category.name}
            className="w-full h-full object-contain scale-60 group-hover:scale-75 transition-transform duration-500 ease-out"
            onError={(e) => {
              e.target.src =
                "https://via.placeholder.com/200x200?text=Category";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
        <div className="p-3 flex-1 flex items-center justify-center">
          <h3 className="text-sm font-bold text-gray-800 text-center group-hover:text-primary-600 transition-colors">
            {category.name}
          </h3>
        </div>
      </motion.div>
    </Link>
  );
};

export default CategoryCard;
