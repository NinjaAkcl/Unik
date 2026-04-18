import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
// Agregamos de vuelta todas las funciones que la app necesita:
import { 
  getFirestore, 
  doc, 
  getDoc, 
  getDocFromServer,
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  collection, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseId: import.meta.env.VITE_FIRESTORE_DATABASE_ID 
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.databaseId); 
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Exportamos también las funciones de Firestore para que el resto de la app las vea
export { 
  doc, getDoc, setDoc, updateDoc, serverTimestamp, 
  collection, getDocs, addDoc, deleteDoc, query, orderBy 
};

// ImgBB External Image Upload
export async function uploadImage(file: File): Promise<string> {
  const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
  
  if (!apiKey) {
    throw new Error("Falta configurar la API KEY de ImgBB");
  }

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  if (data.success) {
    return data.data.url; // Retorna la URL directa de la imagen
  } else {
    throw new Error(data.error?.message || "Error al subir la imagen a ImgBB");
  }
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// User Profile methods
export interface UserProfile {
  name?: string;
  phoneNumber?: string;
  address?: string;
  email: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const d = await getDoc(doc(db, 'users', userId));
    if (d.exists()) {
      return d.data() as UserProfile;
    }
    return null;
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return null;
  }
}

export async function ensureUserProfile(userId: string, email: string): Promise<void> {
  const d = await getDoc(doc(db, 'users', userId));
  if (!d.exists()) {
    await setDoc(doc(db, 'users', userId), {
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

export async function updateUserProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
  const allowedUpdates: any = {
    updatedAt: serverTimestamp()
  };
  
  if (profile.name !== undefined) allowedUpdates.name = profile.name;
  if (profile.phoneNumber !== undefined) allowedUpdates.phoneNumber = profile.phoneNumber;
  if (profile.address !== undefined) allowedUpdates.address = profile.address;

  await updateDoc(doc(db, 'users', userId), allowedUpdates);
}

// Check Admin
export async function checkIsAdmin(uid: string, email: string | null): Promise<boolean> {
  if (email === 'elninja732@gmail.com' || email === 'karentabares31416@gmail.com') return true;
  try {
    const d = await getDoc(doc(db, 'admins', uid));
    return d.exists();
  } catch {
    return false;
  }
}

// Product Management
export interface AppProduct {
  id: string; // The firestore doc internal ID will be used
  name: string;
  price: number;
  category: string; // Used for "Género" (Mujer, Hombre, Unisex, Accesorios)
  type?: string; // Used for "Tipo de prenda" (Pantalón, Remera, Vestido, etc)
  // Support both new schema and legacy string for seamless upgrade
  images?: string[]; 
  sizes?: string[];
  image?: string; 
  inventory?: Record<string, number>; // Maps size name to available stock
}

export async function getProducts(): Promise<AppProduct[]> {
  try {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    if (snap.empty) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppProduct));
  } catch (e) {
    console.error("Failed to fetch products:", e);
    return [];
  }
}

export async function addProduct(product: Omit<AppProduct, 'id'>) {
  await addDoc(collection(db, 'products'), {
    ...product,
    price: Number(product.price),
    images: product.images || (product.image ? [product.image] : []),
    sizes: product.sizes || ['Unica'],
    inventory: product.inventory || {},
    type: product.type || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateProduct(id: string, product: Partial<AppProduct>) {
  const allowedUpdates: any = { updatedAt: serverTimestamp() };
  if (product.name !== undefined) allowedUpdates.name = product.name;
  if (product.price !== undefined) allowedUpdates.price = Number(product.price);
  if (product.category !== undefined) allowedUpdates.category = product.category;
  if (product.type !== undefined) allowedUpdates.type = product.type;
  if (product.image !== undefined) allowedUpdates.image = product.image;
  if (product.images !== undefined) allowedUpdates.images = product.images;
  if (product.sizes !== undefined) allowedUpdates.sizes = product.sizes;
  if (product.inventory !== undefined) allowedUpdates.inventory = product.inventory;
  
  await updateDoc(doc(db, 'products', id), allowedUpdates);
}

export async function deleteProduct(id: string) {
  await deleteDoc(doc(db, 'products', id));
}

// Bootstrap initial setup
export async function bootstrapProductsIfNeeded() {
  try {
    const products = await getProducts();
    if (products.length === 0) {
      const INITIAL = [
        { name: "Tapado Vintage Años 80", price: 45000, category: "Mujer", type: "Abrigo", images: ["https://picsum.photos/seed/fashioncoat/800/1000", "https://picsum.photos/seed/fashioncoatalt/800/1000"], sizes: ["S", "M", "L"], inventory: {"S": 1, "M": 1, "L": 0} },
        { name: "Remera Estampada Retro", price: 15000, category: "Hombre", type: "Remera", images: ["https://picsum.photos/seed/basictee/800/1000"], sizes: ["S", "M", "L", "XL"], inventory: {"S": 1, "M": 2, "L": 1, "XL": 0} },
        { name: "Jean Levi's 501 Usado", price: 35000, category: "Unisex", type: "Pantalón", images: ["https://picsum.photos/seed/linentrousers/800/1000"], sizes: ["40", "42", "44"], inventory: {"40": 1, "42": 1, "44": 0} },
        { name: "Vestido Floral de Feria", price: 25000, category: "Mujer", type: "Vestido", images: ["https://picsum.photos/seed/eveningwear/800/1000", "https://picsum.photos/seed/eveningwear2/800/1000", "https://picsum.photos/seed/eveningwear3/800/1000"], sizes: ["XS", "S", "M"], inventory: {"XS": 1, "S": 1, "M": 0} },
        { name: "Campera de Cuero Original", price: 80000, category: "Hombre", type: "Abrigo", images: ["https://picsum.photos/seed/leatherjack/800/1000"], sizes: ["M", "L", "XL", "XXL"], inventory: {"M": 0, "L": 1, "XL": 1, "XXL": 0} },
        { name: "Cartera de Cuero Gastado", price: 20000, category: "Accesorios", type: "Cartera", images: ["https://picsum.photos/seed/totebag/800/1000", "https://picsum.photos/seed/totebagopen/800/1000"], sizes: ["Unica"], inventory: {"Unica": 1} },
        { name: "Zapatillas Retro Colección", price: 40000, category: "Unisex", type: "Calzado", images: ["https://picsum.photos/seed/urbansneakers/800/1000"], sizes: ["38", "39", "40", "41", "42", "43"], inventory: {"38": 1, "39": 0, "40": 1, "41": 0, "42": 1, "43": 1} },
        { name: "Anteojos de Sol Vintage", price: 12000, category: "Accesorios", type: "Anteojos", images: ["https://picsum.photos/seed/sunnies/800/1000"], sizes: ["Unica"], inventory: {"Unica": 2} }
      ];
      for (const p of INITIAL) {
        await addProduct(p);
      }
    }
  } catch (err) {
    console.warn("Bootstrap saltado por falta de permisos o reglas. Esto es normal en producción público si no sos admin.", err);
  }
}

