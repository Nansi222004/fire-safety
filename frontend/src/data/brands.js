export const brands = [
  {
    id: 1,
    name: "Demo Safety Equipment",
    logo: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 2,
    name: "Fire Safety Shop Direct",
    logo: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 3,
    name: "Sample Fire Equipment",
    logo: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 4,
    name: "Premier Safety Supply",
    logo: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: 5,
    name: "Apex Fire Protection",
    logo: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=200&q=80",
  },
];

export const getBrandById = (id) => brands.find((b) => b.id === parseInt(id));
