/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, Search, Menu, X, Plus, Minus, ArrowRight, User, Settings, Edit2, Trash2, Filter, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { auth, googleProvider, getUserProfile, ensureUserProfile, updateUserProfile, UserProfile, getProducts, addProduct, updateProduct, deleteProduct, bootstrapProductsIfNeeded, checkIsAdmin, AppProduct, uploadImage } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';

// --- Types ---

type CartItem = AppProduct & { quantity: number; selectedSize?: string };

export default function App() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      const savedCart = localStorage.getItem('unik_cart');
      if (savedCart) {
        try {
          return JSON.parse(savedCart);
        } catch (e) {
          console.error("Failed to parse cart from local storage", e);
        }
      }
    }
    return [];
  });
  
  // Store state
  const [products, setProducts] = useState<AppProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<(Partial<AppProduct> & { rawImages?: string; rawSizes?: string }) | null>(null);
  
  // Quick View & Lightbox state
  const [quickViewProduct, setQuickViewProduct] = useState<AppProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  // Category state
  const categories = ['Todo', 'Mujer', 'Hombre', 'Unisex', 'Accesorios'];
  const types = ['Todo', 'Remera', 'Pantalón', 'Abrigo', 'Vestido', 'Calzado', 'Cartera', 'Anteojos'];
  
  const [activeCategory, setActiveCategory] = useState('Todo');
  const [activeType, setActiveType] = useState('Todo');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9;

  // Derive filtered and paginated products
  const filteredProducts = products
    .filter(p => activeCategory === 'Todo' || p.category === activeCategory)
    .filter(p => activeType === 'Todo' || p.type === activeType);
  
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const currentProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, activeType]);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      await bootstrapProductsIfNeeded();
      try {
        const p = await getProducts();
        setProducts(p);
      } catch (err) {
        console.error("Error cargando productos. Posible falta de permisos:", err);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  const refreshProducts = async () => {
    const p = await getProducts();
    setProducts(p);
  };

  // Auth & Profile state
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phoneNumber: '', address: '' });
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('unik_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && u.email) {
        await ensureUserProfile(u.uid, u.email);
        const p = await getUserProfile(u.uid);
        if (p) {
          setProfile(p);
          setEditForm({ name: p.name || '', phoneNumber: p.phoneNumber || '', address: p.address || '' });
        }
        const adminStatus = await checkIsAdmin(u.uid, u.email);
        setIsAdmin(adminStatus);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed", err);
      // Determine if error is popup-closed-by-user
      if (err.code === 'auth/popup-closed-by-user' || err.message?.includes('popup-closed-by-user')) {
        setLoginError("La ventana se cerró o fue bloqueada por el navegador. Como estás en un iframe, a veces necesitas abrir la app en una nueva pestaña (icono arriba a la derecha).");
      } else {
        setLoginError("Ha ocurrido un error al iniciar sesión: " + err.message);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsProfileOpen(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    await updateUserProfile(user.uid, editForm);
    const updated = await getUserProfile(user.uid);
    if (updated) setProfile(updated);
    setIsEditingProfile(false);
  };

  // Navbar scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent scrolling when overlays open
  useEffect(() => {
    if (isCartOpen || isMobileMenuOpen || isProfileOpen || isAdminPanelOpen || quickViewProduct || lightboxImage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isCartOpen, isMobileMenuOpen]);

  // Cart logic
  const addToCart = (product: AppProduct, size?: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.selectedSize === size);
      if (existing) {
        return prev.map(item => 
          (item.id === product.id && item.selectedSize === size) ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, selectedSize: size }];
    });
    setToastMessage(`${product.name} ${size ? `(${size}) ` : ''}añadido al carrito`);
    setQuickViewProduct(null); // automatic close
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const updateQuantity = (id: string, delta: number, size?: string) => {
    setCart(prev => prev.map(item => {
      if (item.id === id && item.selectedSize === size) {
        const stock = item.inventory?.[size!] ?? Infinity;
        const newQuantity = Math.min(Math.max(0, item.quantity + delta), stock);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const cartTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const cartItemsCount = cart.reduce((count, item) => count + item.quantity, 0);

  const handleCheckout = () => {
    let msg = `Hola UniK, quiero hacer el siguiente pedido:\n\n`;
    cart.forEach(item => {
      msg += `- ${item.quantity}x ${item.name} ${item.selectedSize ? `[${item.selectedSize}] ` : ''}($${(item.price * item.quantity).toLocaleString('es-AR')})\n`;
    });
    msg += `\n*TOTAL: $${cartTotal.toLocaleString('es-AR')}*\n\n`;
    msg += `*Mis datos para el envío o retiro:*\n`;
    msg += `Nombre: ${profile?.name || 'No especificado'}\n`;
    msg += `Teléfono: ${profile?.phoneNumber || 'No especificado'}\n`;
    msg += `Dirección: ${profile?.address || 'No especificado'}\n`;
    
    const whatsappUrl = `https://wa.me/34600000000?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="min-h-screen font-sans bg-stone-50 text-stone-900 w-full overflow-x-hidden">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 bg-stone-900 text-white px-6 py-3 rounded shadow-2xl z-50 flex items-center gap-3 text-sm font-medium"
          >
            <ShoppingBag className="w-4 h-4" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar */}
      <header 
        className={`fixed w-full z-40 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] left-0 right-0 flex justify-center ${
          isScrolled ? 'top-4 px-4' : 'top-0 px-0'
        }`}
      >
        <div 
          className={`w-full flex justify-between items-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isScrolled
              ? 'max-w-5xl bg-white/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-stone-200/50 rounded-full px-6 md:px-8 py-3'
              : 'max-w-7xl bg-transparent px-6 md:px-12 py-6 border-transparent'
          }`}
        >
          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className={`w-6 h-6 transition-colors duration-300 ${isScrolled ? 'text-stone-900' : 'text-white'}`} />
          </button>

          {/* Logo */}
          <a href="#" className="font-display font-bold text-2xl tracking-tighter uppercase relative z-50">
            <span className={`transition-colors duration-300 ${isScrolled ? 'text-stone-900' : 'text-white'}`}>UniK</span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-1">
            {/* Nav categories removed from header and moved to product layout */}
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-5 relative z-50">
            <button className={`hidden sm:flex transition-colors duration-300 hover:opacity-70 ${isScrolled ? 'text-stone-900' : 'text-white'}`}>
              <Search className="w-5 h-5" />
            </button>
            <button 
              className={`flex transition-colors duration-300 hover:opacity-70 ${isScrolled ? 'text-stone-900' : 'text-white'}`}
              onClick={() => setIsProfileOpen(true)}
            >
              <User className="w-5 h-5" />
            </button>
            <button 
              className={`relative flex transition-colors duration-300 hover:opacity-70 ${isScrolled ? 'text-stone-900' : 'text-white'}`}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="w-5 h-5" />
              <AnimatePresence>
                {cartItemsCount > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className={`absolute -top-1.5 -right-1.5 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300 ${
                      isScrolled ? 'bg-stone-900 text-white' : 'bg-white text-stone-900'
                    }`}
                  >
                    {cartItemsCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-[80%] max-w-sm bg-stone-50 z-50 p-6 flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-12">
                <span className="font-display font-bold text-2xl tracking-tighter uppercase text-stone-900">UniK</span>
                <button onClick={() => setIsMobileMenuOpen(false)}>
                  <X className="w-6 h-6 text-stone-500" />
                </button>
              </div>
              <nav className="flex flex-col space-y-6 flex-grow">
                {categories.map(item => (
                  <button 
                    key={item} 
                    onClick={() => {
                      setActiveCategory(item);
                      setIsMobileMenuOpen(false);
                      // Scroll to products
                      document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-2xl font-display font-medium text-stone-900 hover:text-stone-500 transition-colors text-left"
                  >
                    {item}
                  </button>
                ))}
              </nav>
              <div className="pt-8 border-t border-stone-200">
                <a href="#" className="flex items-center text-sm font-medium text-stone-500 hover:text-stone-900">
                  <Search className="w-4 h-4 mr-3" /> Buscar
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

        {/* Mobile Filter Drawer */}
        <AnimatePresence>
        {isFilterMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setIsFilterMenuOpen(false)}
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-[85%] max-w-sm bg-white z-50 flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-stone-900" />
                  <span className="font-display font-medium text-lg text-stone-900">Filtros</span>
                </div>
                <button onClick={() => setIsFilterMenuOpen(false)}>
                  <X className="w-6 h-6 text-stone-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-10">
                {/* Reset Filters Mobile */}
                {(activeCategory !== 'Todo' || activeType !== 'Todo') && (
                  <button 
                    onClick={() => {
                      setActiveCategory('Todo');
                      setActiveType('Todo');
                      setIsFilterMenuOpen(false);
                    }}
                    className="w-full text-center text-sm font-semibold uppercase tracking-widest text-stone-900 border border-stone-900 py-3 hover:bg-stone-900 hover:text-white transition-colors"
                  >
                    Borrar Filtros
                  </button>
                )}

                {/* Gender Mobile */}
                <div>
                  <h3 className="font-display font-medium text-lg mb-5 text-stone-900">Género</h3>
                  <ul className="space-y-4">
                    {categories.map(cat => (
                      <li key={cat}>
                        <button 
                          onClick={() => setActiveCategory(cat)}
                          className={`text-base flex items-center gap-4 transition-colors ${activeCategory === cat ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'}`}
                        >
                          <div className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${activeCategory === cat ? 'border-stone-900 bg-stone-900' : 'border-stone-300 bg-transparent'}`}>
                            {activeCategory === cat && <div className="w-2 h-2 bg-white rounded-sm" />}
                          </div>
                          {cat}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Type Mobile */}
                <div>
                  <h3 className="font-display font-medium text-lg mb-5 text-stone-900">Tipo de Prenda</h3>
                  <ul className="space-y-4">
                    {types.map(t => (
                      <li key={t}>
                        <button 
                          onClick={() => setActiveType(t)}
                          className={`text-base flex items-center gap-4 transition-colors ${activeType === t ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'}`}
                        >
                          <div className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${activeType === t ? 'border-stone-900 bg-stone-900' : 'border-stone-300 bg-transparent'}`}>
                            {activeType === t && <div className="w-2 h-2 bg-white rounded-sm" />}
                          </div>
                          {t}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="p-6 border-t border-stone-100">
                <button 
                  onClick={() => setIsFilterMenuOpen(false)}
                  className="w-full bg-stone-900 text-white py-4 font-medium"
                >
                  Ver Resultados
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
              onClick={() => setIsCartOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center p-6 border-b border-stone-100">
                <h2 className="font-display text-xl font-medium">Tu Carrito ({cartItemsCount})</h2>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto w-full p-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4">
                    <ShoppingBag className="w-16 h-16 opacity-20" />
                    <p className="font-medium text-lg">Tu carrito está vacío.</p>
                    <button 
                      onClick={() => setIsCartOpen(false)}
                      className="mt-4 text-sm text-stone-900 border-b border-stone-900 pb-1"
                    >
                      Continuar comprando
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cart.map((item, i) => (
                      <div key={`${item.id}-${i}`} className="flex gap-4">
                        <div className="w-24 h-32 flex-shrink-0 bg-stone-100/50 rounded overflow-hidden">
                          <img src={item.images?.[0] || item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 flex flex-col pt-1">
                          <div className="flex justify-between">
                            <h3 className="font-medium text-stone-900 line-clamp-1">{item.name}</h3>
                            <span className="font-medium">€{item.price}</span>
                          </div>
                          <p className="text-sm text-stone-500 mt-1">{item.category} {item.selectedSize ? `| Talla ${item.selectedSize}` : ''}</p>
                          
                          <div className="mt-auto flex items-center border border-stone-200 w-fit rounded">
                            <button 
                              onClick={() => updateQuantity(item.id, -1, item.selectedSize)}
                              className="p-2 text-stone-500 hover:text-stone-900 transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, 1, item.selectedSize)}
                              className="p-2 text-stone-500 hover:text-stone-900 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="border-t border-stone-100 p-6 bg-stone-50">
                  <div className="flex justify-between items-center mb-6 text-lg font-medium">
                    <span>Subtotal</span>
                    <span>${cartTotal.toLocaleString('es-AR')}</span>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="w-full bg-[#25D366] text-white py-4 font-medium hover:bg-[#128C7E] transition-colors flex items-center justify-center group"
                  >
                    Comprar por WhatsApp
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <p className="text-center text-xs text-stone-500 mt-4">
                    Impuestos calculados en el siguiente paso.
                  </p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative h-[90vh] min-h-[600px] w-full bg-stone-900">
        <div className="absolute inset-0 w-full h-full">
          <img 
            src="https://picsum.photos/seed/editorialfashion1/1920/1080" 
            alt="Moda Circular y Vintage" 
            className="w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-black/20 to-transparent" />
        
        <div className="relative h-full max-w-7xl mx-auto px-6 md:px-12 flex flex-col justify-end text-white pb-24">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-2xl"
          >
            <span className="text-sm uppercase tracking-[0.2em] font-medium mb-4 block text-stone-300">
              Moda Circular 2026
            </span>
            <h1 className="text-5xl md:text-7xl font-display font-medium tracking-tight mb-6 leading-[1.1]">
              Ropa con <br/>historia.
            </h1>
            <p className="text-lg md:text-xl text-stone-200 mb-10 max-w-lg font-light">
              Descubrí prendas únicas y piezas vintage de segunda mano seleccionadas con propósito en Argentina.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="bg-white text-stone-900 px-8 py-4 font-medium hover:bg-stone-200 transition-colors w-fit">
                Ver Colección
              </button>
              <button className="border border-white/30 backdrop-blur-xs text-white px-8 py-4 font-medium hover:bg-white/10 transition-colors w-fit text-left">
                Nuestras Joyitas
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Products */}
      <section id="productos" className="py-24 max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6 border-b border-stone-200 pb-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight mb-4">Catálogo Completo</h2>
            <p className="text-stone-500 text-lg">Las mejores piezas de moda circular al alcance de tu mano.</p>
          </div>
        </div>

        {/* Mobile Filter Toggle */}
        <div className="md:hidden mb-8">
          <button 
            onClick={() => setIsFilterMenuOpen(true)}
            className="w-full flex items-center justify-center gap-2 border border-stone-300 py-3 text-sm font-medium hover:bg-stone-100 transition-colors"
          >
            <Filter className="w-4 h-4" /> 
            Filtrar Productos {(activeCategory !== 'Todo' || activeType !== 'Todo') && '(Activos)'}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-12">
          {/* Desktop Sidebar Filters */}
          <aside className="hidden md:block w-56 flex-shrink-0">
            <div className="sticky top-28 space-y-10">
              
              {/* Reset Filters */}
              {(activeCategory !== 'Todo' || activeType !== 'Todo') && (
                <button 
                  onClick={() => {
                    setActiveCategory('Todo');
                    setActiveType('Todo');
                  }}
                  className="text-xs font-semibold uppercase tracking-widest text-stone-900 border-b border-stone-900 pb-1 hover:text-stone-500 transition-colors"
                >
                  Limpiar Filtros
                </button>
              )}

              {/* Gender Sidebar */}
              <div>
                <h3 className="font-display font-medium text-lg mb-4 text-stone-900">Género</h3>
                <ul className="space-y-3">
                  {categories.map(cat => (
                    <li key={cat}>
                      <button 
                        onClick={() => setActiveCategory(cat)}
                        className={`text-sm flex items-center gap-3 transition-colors ${activeCategory === cat ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'}`}
                      >
                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${activeCategory === cat ? 'border-stone-900 bg-stone-900' : 'border-stone-300 bg-transparent'}`}>
                          {activeCategory === cat && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                        </div>
                        {cat}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Type Sidebar */}
              <div>
                <h3 className="font-display font-medium text-lg mb-4 text-stone-900">Tipo de Prenda</h3>
                <ul className="space-y-3">
                  {types.map(t => (
                    <li key={t}>
                      <button 
                        onClick={() => setActiveType(t)}
                        className={`text-sm flex items-center gap-3 transition-colors ${activeType === t ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'}`}
                      >
                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${activeType === t ? 'border-stone-900 bg-stone-900' : 'border-stone-300 bg-transparent'}`}>
                          {activeType === t && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                        </div>
                        {t}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          {/* Product Grid Area */}
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 mb-12">
              {isLoadingProducts ? (
                <div className="col-span-full py-12 text-center text-stone-500">Cargando colección...</div>
              ) : currentProducts.length === 0 ? (
                <div className="col-span-full py-12 text-center text-stone-500">No se encontraron productos para combinar en esta categoría y prenda.</div>
              ) : currentProducts.map((product, index) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group cursor-pointer flex flex-col"
              onClick={() => {
                setQuickViewProduct(product);
                setSelectedSize(null);
                setActiveImageIndex(0);
              }}
            >
              <div className="relative aspect-[3/4] bg-stone-100 rounded overflow-hidden mb-4 border border-stone-200/50">
                <img 
                  src={(product.images && product.images.length > 0) ? product.images[0] : product.image} 
                  alt={product.name} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
                
                {/* Hover Add to Bag Action */}
                <div className="absolute bottom-0 left-0 w-full p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickViewProduct(product);
                      setSelectedSize(null);
                      setActiveImageIndex(0);
                    }}
                    className="w-full bg-white/90 backdrop-blur text-stone-900 py-3 font-medium text-sm shadow-lg hover:bg-stone-900 hover:text-white transition-colors flex justify-center items-center"
                  >
                    Ver detalles
                  </button>
                </div>
                
                {/* Sold out overlay */}
                {product.sizes && product.inventory && product.sizes.every(size => product.inventory![size] === 0) && (
                   <div className="absolute top-4 right-4 bg-white/90 text-stone-900 text-xs font-medium px-2 py-1 tracking-widest hidden md:block group-hover:hidden transition-opacity">
                      AGOTADO
                   </div>
                )}
              </div>
              <div className="flex justify-between items-start pt-1">
                <div>
                  <h3 className="font-medium text-stone-900 text-base">{product.name}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-xs text-stone-500 uppercase tracking-wider">{product.category}</p>
                    {product.type && (
                      <>
                        <span className="text-stone-300 mx-1">•</span>
                        <p className="text-xs text-stone-500 uppercase tracking-wider">{product.type}</p>
                      </>
                    )}
                  </div>
                </div>
                <span className="font-medium text-stone-900">${product.price.toLocaleString('es-AR')}</span>
              </div>
            </motion.div>
          ))}
            </div>

            {/* Pagination Controls */}
            {!isLoadingProducts && totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-auto pt-8 border-t border-stone-200">
                <button 
                  onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={currentPage === 1}
                  className="p-2 border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-900 disabled:opacity-30 disabled:hover:border-stone-200 disabled:hover:text-stone-500 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCurrentPage(i + 1);
                        document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`w-10 h-10 flex items-center justify-center text-sm font-medium transition-colors border ${
                        currentPage === i + 1 
                          ? 'border-stone-900 bg-stone-900 text-white' 
                          : 'border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-200'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
                    document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-900 disabled:opacity-30 disabled:hover:border-stone-200 disabled:hover:text-stone-500 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Values Banner */}
      <section className="bg-stone-200 py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left divide-y md:divide-y-0 md:divide-x divide-stone-300">
            <div className="pt-8 md:pt-0 md:pr-12 first:pt-0">
              <h4 className="font-display font-medium text-xl mb-3">Moda Circular</h4>
              <p className="text-stone-600">Reducimos el impacto ambiental dándole una segunda vida a prendas en perfecto estado.</p>
            </div>
            <div className="pt-8 md:pt-0 md:px-12">
              <h4 className="font-display font-medium text-xl mb-3">Joyitas Vintage</h4>
              <p className="text-stone-600">Hacemos una curaduría especial de tesoros escondidos para que tu estilo sea verdaderamente único.</p>
            </div>
            <div className="pt-8 md:pt-0 md:pl-12">
              <h4 className="font-display font-medium text-xl mb-3">Envíos por Uber</h4>
              <p className="text-stone-600">Hacemos envíos rápidos y seguros en el día dentro de Córdoba Capital por Uber Flash.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Image Banner */}
      <section className="w-full h-[60vh] min-h-[400px]">
        <img 
          src="https://picsum.photos/seed/minimalistfashion/1920/800" 
          alt="Colección Neutra"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </section>

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-300 py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <span className="font-display font-bold text-2xl tracking-tighter uppercase text-white mb-6 block">UniK</span>
              <p className="mt-4 text-stone-400 text-sm leading-relaxed">
                Reimaginando los básicos diarios con un enfoque humano y sostenible. Moda que no requiere esfuerzo.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-medium mb-6 uppercase tracking-wider text-sm">Comprar</h4>
              <ul className="space-y-4 text-sm text-stone-400">
                <li><a href="#" className="hover:text-white transition-colors">Mujer</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Hombre</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Accesorios</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Rebajas</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-medium mb-6 uppercase tracking-wider text-sm">Ayuda</h4>
              <ul className="space-y-4 text-sm text-stone-400">
                <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Envíos y Devoluciones</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Guía de Tallas</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-medium mb-6 uppercase tracking-wider text-sm">Newsletter</h4>
              <p className="text-sm text-stone-400 mb-4">Únete para recibir noticias y ofertas exclusivas.</p>
              <div className="flex border-b border-stone-600 pb-2 focus-within:border-white transition-colors">
                <input 
                  type="email" 
                  placeholder="Tu email" 
                  className="bg-transparent border-none outline-none flex-grow text-white text-sm"
                />
                <button className="text-sm uppercase tracking-widest font-medium hover:text-white transition-colors">
                  Unirme
                </button>
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-stone-800 flex flex-col md:flex-row justify-between items-center text-sm text-stone-500">
            <p>&copy; 2026 UniK. Todos los derechos reservados.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition-colors">Instagram</a>
              <a href="#" className="hover:text-white transition-colors">TikTok</a>
              <a href="#" className="hover:text-white transition-colors">Pinterest</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Profile Drawer */}
      <AnimatePresence>
        {isProfileOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
              onClick={() => setIsProfileOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center p-6 border-b border-stone-100">
                <h2 className="font-display text-xl font-medium">Mi Perfil</h2>
                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto w-full p-6">
                {!user ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                    <User className="w-16 h-16 text-stone-200" />
                    <div>
                      <h3 className="text-xl font-medium mb-2">Accede a tu cuenta</h3>
                      <p className="text-stone-500 text-sm">Guarda tus datos de envío y agiliza tus compras por WhatsApp.</p>
                    </div>
                    <button 
                      onClick={handleLogin}
                      className="bg-stone-900 text-white px-6 py-3 font-medium hover:bg-stone-800 transition-colors"
                    >
                      Iniciar sesión con Google
                    </button>
                    {loginError && (
                      <div className="text-red-500 text-xs mt-4 bg-red-50 p-3 rounded text-left border border-red-100">
                        {loginError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-stone-500">{user.email}</p>
                      <button onClick={handleLogout} className="text-xs text-red-500 hover:underline">
                        Cerrar sesión
                      </button>
                    </div>

                    {isAdmin && (
                      <div className="bg-stone-900 border border-stone-800 rounded p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Settings className="w-5 h-5 text-stone-300" />
                          <span className="text-sm font-medium">Panel de Superusuario</span>
                        </div>
                        <button 
                          onClick={() => {
                            setIsProfileOpen(false);
                            setIsAdminPanelOpen(true);
                          }}
                          className="text-xs bg-white text-stone-900 px-3 py-1.5 font-medium hover:bg-stone-200"
                        >
                          Gestionar Prods
                        </button>
                      </div>
                    )}
                    
                    <div className="border-t border-stone-100 pt-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-medium text-lg">Datos de envío</h3>
                        {!isEditingProfile && (
                          <button 
                            onClick={() => setIsEditingProfile(true)} 
                            className="text-stone-500 text-sm hover:text-stone-900 underline"
                          >
                            Editar
                          </button>
                        )}
                      </div>

                      {isEditingProfile ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm text-stone-500 mb-1">Nombre Completo</label>
                            <input 
                              type="text" 
                              value={editForm.name} 
                              onChange={e => setEditForm({...editForm, name: e.target.value})}
                              className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-stone-500 mb-1">WhatsApp / Teléfono</label>
                            <input 
                              type="text" 
                              value={editForm.phoneNumber} 
                              onChange={e => setEditForm({...editForm, phoneNumber: e.target.value})}
                              className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-stone-500 mb-1">Dirección de entrega</label>
                            <textarea 
                              value={editForm.address} 
                              onChange={e => setEditForm({...editForm, address: e.target.value})}
                              className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500 resize-none h-24"
                            />
                          </div>
                          <div className="flex gap-3 pt-2">
                            <button 
                              onClick={saveProfile}
                              className="bg-stone-900 text-white px-4 py-2 text-sm font-medium hover:bg-stone-800"
                            >
                              Guardar cambios
                            </button>
                            <button 
                              onClick={() => {
                                setIsEditingProfile(false);
                                setEditForm({ name: profile?.name || '', phoneNumber: profile?.phoneNumber || '', address: profile?.address || '' });
                              }}
                              className="text-stone-500 px-4 py-2 text-sm font-medium hover:bg-stone-50 hover:text-stone-900"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 bg-stone-50 p-4 border border-stone-100 rounded text-sm">
                          <div>
                            <span className="block text-stone-500 text-xs mb-0.5">Nombre</span>
                            <span>{profile?.name || 'No especificado'}</span>
                          </div>
                          <div>
                            <span className="block text-stone-500 text-xs mb-0.5">Teléfono</span>
                            <span>{profile?.phoneNumber || 'No especificado'}</span>
                          </div>
                          <div>
                            <span className="block text-stone-500 text-xs mb-0.5">Dirección</span>
                            <span>{profile?.address || 'No especificada'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Admin Panel Drawer */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setIsAdminPanelOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center p-6 border-b border-stone-100 bg-stone-50">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-stone-900" />
                  <h2 className="font-display text-xl font-medium">Gestión de Inventario</h2>
                </div>
                <button 
                  onClick={() => setIsAdminPanelOpen(false)}
                  className="p-2 hover:bg-stone-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-white">
                {editingProduct ? (
                  <div className="space-y-4">
                    <h3 className="font-medium text-lg mb-4">{editingProduct.id ? 'Editar Producto' : 'Crear Nuevo Producto'}</h3>
                    
                    <div>
                      <label className="block text-sm text-stone-500 mb-1">Nombre</label>
                      <input 
                        type="text" 
                        value={editingProduct.name || ''} 
                        onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                        className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-stone-500 mb-1">Precio ($)</label>
                      <input 
                        type="number" 
                        value={editingProduct.price || ''} 
                        onChange={e => setEditingProduct({...editingProduct, price: Number(e.target.value)})}
                        className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-stone-500 mb-1">Categoría (Género)</label>
                      <select
                        value={editingProduct.category || ''}
                        onChange={e => setEditingProduct({...editingProduct, category: e.target.value})}
                        className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500 bg-white"
                      >
                        <option value="">Seleccionar...</option>
                        {categories.filter(c => c !== 'Todo').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-stone-500 mb-1">Tipo de Prenda</label>
                      <select
                        value={editingProduct.type || ''}
                        onChange={e => setEditingProduct({...editingProduct, type: e.target.value})}
                        className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500 bg-white"
                      >
                        <option value="">Seleccionar...</option>
                        {types.filter(t => t !== 'Todo').map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-stone-500 mb-1">Imágenes del Producto</label>
                      
                      <div className="flex gap-2 overflow-x-auto mb-2">
                        {editingProduct.rawImages?.split(',').map(s => s.trim()).filter(Boolean).map((img, i) => (
                          <div key={i} className="relative w-16 h-16 shrink-0 border border-stone-200 rounded overflow-hidden">
                            <img src={img} className="w-full h-full object-cover" alt={`Preview ${i}`} />
                            <button
                              onClick={() => {
                                const urls = editingProduct.rawImages?.split(',').map(s => s.trim()).filter(Boolean) || [];
                                const newUrls = urls.filter((_, index) => index !== i);
                                setEditingProduct({...editingProduct, rawImages: newUrls.join(',')});
                              }}
                              className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl hover:bg-red-600 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {isUploadingImage && (
                          <div className="w-16 h-16 shrink-0 border border-stone-200 rounded flex items-center justify-center bg-stone-50 text-stone-400">
                            <div className="animate-spin w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full" />
                          </div>
                        )}
                      </div>

                      <div className="relative mb-2">
                        <input 
                          type="file" 
                          multiple
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={async (e) => {
                            if (!e.target.files?.length) return;
                            setIsUploadingImage(true);
                            const currentUrls = editingProduct.rawImages?.split(',').map(s => s.trim()).filter(Boolean) || [];
                            const files = Array.from(e.target.files) as File[];
                            try {
                              for (const file of files) {
                                const url = await uploadImage(file);
                                currentUrls.push(url);
                              }
                              setEditingProduct({...editingProduct, rawImages: currentUrls.join(',')});
                            } catch (err) {
                              console.error(err);
                              alert("Error: " + (err instanceof Error ? err.message : "No se pudo subir a ImgBB. Revisá la API KEY en tu archivo .env"));
                            } finally {
                              setIsUploadingImage(false);
                            }
                          }}
                        />
                        <div className="w-full border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 rounded hover:bg-stone-50 transition-colors">
                          <Upload className="w-5 h-5 mx-auto mb-1 opacity-50" />
                          Hacé clic o arrastrá para subir fotos desde tu dispositivo
                        </div>
                      </div>

                      <p className="text-xs text-stone-400 mb-1">También podés pegar links manualmente si preferís:</p>
                      <input 
                        type="text" 
                        value={editingProduct.rawImages ?? ''} 
                        onChange={e => setEditingProduct({ ...editingProduct, rawImages: e.target.value })}
                        className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-stone-500 mb-1">Tallas disponibles (separadas por coma)</label>
                      <input 
                        type="text" 
                        value={editingProduct.rawSizes ?? ''} 
                        onChange={e => setEditingProduct({ ...editingProduct, rawSizes: e.target.value })}
                        placeholder="S, M, L, XL ó Unica"
                        className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                      />
                    </div>
                    
                    {editingProduct.rawSizes && editingProduct.rawSizes.split(',').filter(s => s.trim() !== '').length > 0 && (
                      <div className="mt-4 p-4 bg-stone-50 border border-stone-200 rounded">
                        <h4 className="text-sm font-medium text-stone-900 mb-3">Stock por talla</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {Array.from(new Set<string>(editingProduct.rawSizes.split(',').map(s => s.trim()).filter(Boolean))).map((size, index) => (
                            <div key={`${size}-${index}`}>
                              <label className="block text-xs text-stone-500 mb-1">{size}</label>
                              <input
                                type="number"
                                min="0"
                                value={editingProduct.inventory?.[size] ?? 0}
                                onChange={e => setEditingProduct({
                                  ...editingProduct,
                                  inventory: { ...(editingProduct.inventory || {}), [size]: Number(e.target.value) }
                                })}
                                className="w-full border border-stone-200 p-2 text-sm outline-none focus:border-stone-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={async () => {
                          if (!editingProduct.name || !editingProduct.price || !editingProduct.category) {
                            alert("Por favor completa los campos principales.");
                            return;
                          }
                          
                          const finalImages = editingProduct.rawImages 
                            ? editingProduct.rawImages.split(',').map(s => s.trim()).filter(Boolean) 
                            : [];
                            
                          const finalSizes = editingProduct.rawSizes 
                            ? Array.from(new Set(editingProduct.rawSizes.split(',').map(s => s.trim()).filter(Boolean)))
                            : [];
                          
                          const productToSave: any = {
                            ...editingProduct,
                            images: finalImages,
                            image: finalImages[0] || 'https://picsum.photos/seed/newitem/800/1000',
                            sizes: finalSizes,
                          };
                          delete productToSave.rawImages;
                          delete productToSave.rawSizes;
                          
                          if (editingProduct.id) {
                            await updateProduct(editingProduct.id, productToSave);
                            setToastMessage("Producto actualizado");
                          } else {
                            await addProduct(productToSave as AppProduct);
                            setToastMessage("Producto creado");
                          }
                          await refreshProducts();
                          setEditingProduct(null);
                        }}
                        className="flex-1 bg-[#25D366] text-white py-3 font-medium hover:bg-[#128C7E] transition-colors"
                      >
                        {editingProduct.id ? 'Guardar Cambios' : 'Añadir Producto'}
                      </button>
                      <button 
                        onClick={() => setEditingProduct(null)}
                        className="flex-1 border border-stone-200 text-stone-900 py-3 font-medium hover:bg-stone-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button 
                      onClick={() => setEditingProduct({ 
                        name: '', price: 0, category: '', rawImages: '', rawSizes: 'S, M, L', inventory: { 'S': 10, 'M': 10, 'L': 10 } 
                      })}
                      className="w-full border-2 border-dashed border-stone-300 py-4 text-stone-600 font-medium hover:bg-stone-50 transition-colors mb-6 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" /> Nuevo Producto
                    </button>

                    <div className="space-y-4">
                      {products.map(p => (
                        <div key={p.id} className="flex gap-4 border border-stone-200 p-3 rounded">
                          <div className="w-16 h-20 bg-stone-100 rounded overflow-hidden flex-shrink-0">
                            <img src={p.images?.[0] || p.image} alt={p.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate">{p.name}</h4>
                            <p className="text-stone-500 text-xs mt-1">{p.category}</p>
                            <p className="font-medium text-sm mt-1">€{p.price}</p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => setEditingProduct({
                                ...p,
                                rawImages: p.images?.join(', ') || p.image || '',
                                rawSizes: p.sizes?.join(', ') || ''
                              })}
                              className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded transition"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async () => {
                                if(confirm(`¿Seguro que quieres borrar ${p.name}?`)) {
                                  await deleteProduct(p.id);
                                  setToastMessage("Producto eliminado");
                                  await refreshProducts();
                                }
                              }}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick View / Product Detail Modal */}
      <AnimatePresence>
        {quickViewProduct && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
              onClick={() => setQuickViewProduct(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col md:flex-row"
            >
              <button 
                onClick={() => setQuickViewProduct(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/80 hover:bg-white rounded-full transition-colors drop-shadow-sm"
              >
                <X className="w-5 h-5 text-stone-900" />
              </button>
              
              {/* Image Gallery */}
              <div className="w-full md:w-1/2 flex flex-col">
                <div 
                  className="w-full aspect-[4/5] md:aspect-auto md:h-[600px] bg-stone-100 relative cursor-zoom-in group"
                  onClick={() => setLightboxImage((quickViewProduct.images && quickViewProduct.images.length > 0) ? quickViewProduct.images[activeImageIndex] : quickViewProduct.image!)}
                >
                  <img 
                    src={(quickViewProduct.images && quickViewProduct.images.length > 0) ? quickViewProduct.images[activeImageIndex] : quickViewProduct.image} 
                    alt={quickViewProduct.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                </div>
                
                {/* Thumbnails */}
                {quickViewProduct.images && quickViewProduct.images.length > 1 && (
                  <div className="flex gap-2 p-4 overflow-x-auto border-r border-stone-100">
                    {quickViewProduct.images.map((img, i) => (
                      <button 
                        key={i} 
                        onClick={() => setActiveImageIndex(i)}
                        className={`relative w-20 h-24 flex-shrink-0 bg-stone-100 rounded overflow-hidden ${activeImageIndex === i ? 'ring-2 ring-stone-900 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
                      >
                        <img src={img} alt={`Thumbnail ${i}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm uppercase tracking-widest text-stone-500 font-medium">{quickViewProduct.category}</span>
                  {quickViewProduct.type && (
                    <>
                      <span className="text-stone-300">•</span>
                      <span className="text-sm uppercase tracking-widest text-stone-500 font-medium">{quickViewProduct.type}</span>
                    </>
                  )}
                </div>
                <h2 className="text-3xl font-display font-medium mb-4">{quickViewProduct.name}</h2>
                <span className="text-2xl font-light mb-8">${quickViewProduct.price.toLocaleString('es-AR')}</span>
                
                {/* Size Selector */}
                {quickViewProduct.sizes && quickViewProduct.sizes.length > 0 && (
                  <div className="mb-8">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-medium uppercase tracking-widest">Talla</h4>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {quickViewProduct.sizes.map((size, index) => {
                        const stock = quickViewProduct.inventory?.[size];
                        const isOutOfStock = stock !== undefined && Number(stock) <= 0;
                        return (
                          <button
                            key={`${size}-${index}`}
                            disabled={isOutOfStock}
                            onClick={() => setSelectedSize(size)}
                            className={`w-14 h-12 flex items-center justify-center border font-medium text-sm transition-all ${
                              isOutOfStock 
                                ? 'opacity-40 cursor-not-allowed bg-stone-100 text-stone-400 border-stone-200' 
                                : selectedSize === size 
                                  ? 'border-stone-900 bg-stone-900 text-white' 
                                  : 'border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900'
                            }`}
                            title={isOutOfStock ? "Agotado" : stock !== undefined ? `Stock: ${stock}` : "Disponible"}
                          >
                            {size}
                          </button>
                        );
                      })}
                    </div>
                    {selectedSize && quickViewProduct.inventory?.[selectedSize] !== undefined && (
                      <p className="text-xs text-stone-500 mt-2">
                        {Number(quickViewProduct.inventory[selectedSize]) > 0 ? `${quickViewProduct.inventory[selectedSize]} disponibles` : 'Agotado'}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-4 mt-auto pt-8">
                  <button 
                    disabled={
                      (quickViewProduct.sizes && quickViewProduct.sizes.length > 0 && quickViewProduct.sizes.every(s => quickViewProduct.inventory?.[s] !== undefined && Number(quickViewProduct.inventory[s]) <= 0))
                      || (!quickViewProduct.sizes?.length && quickViewProduct.inventory?.['Unica'] !== undefined && Number(quickViewProduct.inventory['Unica']) <= 0)
                    }
                    onClick={() => {
                      if (quickViewProduct.sizes && quickViewProduct.sizes.length > 0 && !selectedSize) {
                        alert("Por favor selecciona una talla");
                        return;
                      }
                      
                      const currentStock = quickViewProduct.inventory?.[selectedSize || 'Unica'] ?? Infinity;
                      const sizeToCheck = selectedSize || 'Unica';
                      const inCart = cart.find(item => item.id === quickViewProduct.id && (item.selectedSize || 'Unica') === sizeToCheck)?.quantity || 0;
                      
                      if (inCart >= currentStock) {
                        alert("¡No hay suficiente stock disponible para añadir más!");
                        return;
                      }
                      
                      addToCart(quickViewProduct, selectedSize || undefined);
                    }}
                    className="flex-1 bg-stone-900 text-white py-4 font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {
                      (quickViewProduct.sizes && quickViewProduct.sizes.length > 0 && quickViewProduct.sizes.every(s => quickViewProduct.inventory?.[s] !== undefined && Number(quickViewProduct.inventory[s]) <= 0))
                      || (!quickViewProduct.sizes?.length && quickViewProduct.inventory?.['Unica'] !== undefined && Number(quickViewProduct.inventory['Unica']) <= 0)
                      ? 'AGOTADO' : 'Añadir al carrito'
                    }
                  </button>
                </div>
                
                <div className="mt-8 border-t border-stone-100 pt-6 space-y-4">
                  <div className="flex gap-3 text-sm text-stone-600">
                    <span className="shrink-0">•</span><span>Envío gratis en compras superiores a $100.000.</span>
                  </div>
                  <div className="flex gap-3 text-sm text-stone-600">
                    <span className="shrink-0">•</span><span>Consultá nuestra política de cambios.</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
              onClick={() => setLightboxImage(null)}
            />
            <button 
              onClick={() => setLightboxImage(null)}
              className="absolute top-6 right-6 z-10 p-3 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            <motion.img 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              src={lightboxImage} 
              alt="Fullscreen view" 
              className="relative z-10 max-w-full max-h-[90vh] object-contain px-4"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
