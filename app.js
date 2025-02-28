// ===================================
// DEPENDENCIAS E IMPORTACIONES
// ===================================
const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcrypt');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const paypal = require('@paypal/checkout-server-sdk');
const dotenv = require('dotenv');

// Models
const Blog = require('./models/blog');
const User = require('./models/user');
const Producto = require('./models/productos');

// ===================================
// CONFIGURACIÓN
// ===================================
dotenv.config();

const app = express();
const PORT = 3000;
const db = process.env.MONGO_URI;

// CONEXIÓN A BASE DE DATOS
mongoose.connect(db)
  .then(() => app.listen(PORT))
  .catch((error) => console.log(error));

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', 'views');

// ===================================
// AUTHENTICATION CONFIGURATION
// ===================================
passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await User.findOne({ username });
    if (!user) return done(null, false, { message: 'Usuario no encontrado' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return done(null, false, { message: 'Contraseña incorrecta' });
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// ===================================
// MIDDLEWARE CONFIGURATION
// ===================================
// Session Configuration
app.use(session({
  secret: require('crypto').randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 30 } // 30 minutes
}));

// PayPal Configuration
const paypalClient = new paypal.core.PayPalHttpClient(
  new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_SECRET
  )
);

// General Middleware
app.use(methodOverride('_method'));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// User and Flash Message Middleware
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.message = req.flash('error');
    next();
});

// ===================================
// UTILITY MIDDLEWARE
// ===================================
// Authentication Check
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ storage });

// ===================================
// BLOG ROUTES
// ===================================
app.get('/', async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.render('main', { Title: 'INICIO', blogs });
  } catch (error) {
    console.log(error);
  }
});

app.get('/blogs/crear', (req, res) => {
  res.render('crear', { Title: 'Crear Blog' });
});

app.post('/blogs/crear', upload.single('image'), async (req, res) => {
  const { title, snippet, body } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const newBlog = new Blog({ title, snippet, body, imagePath });
  try {
    await newBlog.save();
    res.redirect('/');
  } catch (error) {
    console.log(error);
  }
});

app.get('/blogs/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    res.render('detalles', { blog, Title: 'Detalles Blog' });
  } catch (error) {
    console.log(error);
  }
});

// Ruta para mostrar el formulario de edición
app.get('/blogs/:id/editar', (req, res) => {
    const { id } = req.params;
  
    // Buscar el blog por su ID
    Blog.findById(id)
      .then(blog => {
        if (!blog) {
          return res.status(404).send('Blog no encontrado');
        }
        res.render('editar', { blog, Title: 'Editar Blog' });
      })
      .catch(error => {
        console.log(error);
        res.status(500).send('Error al cargar el blog');
      });
  });
  
// Ruta para eliminar un blog
app.delete('/blogs/:id', (req, res) => {
    const { id } = req.params;  // Obtener el ID del blog desde la URL
  
    // Verificar si el ID es válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).send('Blog no encontrado');
    }
  
    // Eliminar el blog de la base de datos
    Blog.findByIdAndDelete(id)
      .then(result => {
        if (!result) {
          return res.status(404).send('Blog no encontrado');
        }
        res.redirect('/'); // Redirigir al inicio después de eliminar el blog
      })
      .catch(error => {
        console.log(error);
        res.status(500).send('Error al eliminar el blog');
      });
  });
  
// Ruta para actualizar un blog
app.put('/blogs/:id', (req, res) => {
    const { id } = req.params;
    const { title, snippet, body } = req.body;
  
    // Verificar si el ID es válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).send('Blog no encontrado');
    }
  
    // Actualizar el blog con los nuevos datos
    Blog.findByIdAndUpdate(id, { title, snippet, body }, { new: true })
      .then((result) => {
        if (!result) {
          return res.status(404).send('Blog no encontrado');
        }
        res.redirect('/'); // Redirigir al inicio después de editar el blog
      })
      .catch((error) => {
        console.log(error);
        res.status(500).send('Error al actualizar el blog');
      });
  });

// Ruta para ver los productos
app.get('/productos', async(req, res) => {
  try {
    const productos = await Producto.find().sort({createdAt: -1});
    const cesta = req.session.cesta || [];
    const cestaCantidad = cesta.reduce((total,item)=> total + item.cantidad, 0);
    
    res.render('productos', { Title: 'Lista de Productos', productos, cestaCantidad });
  } catch(error) {
    console.log('Error al obtener los productos:', error);
    res.status(500).send("Error al cargar los productos");
  }
});

// Rutas de autenticación
app.get('/login', (req, res) => {
  res.render('login', { Title: 'Login' });
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/usuarios',
    failureRedirect: '/login',
    failureFlash: true 
}));

app.get('/sign-up', (req, res) => {
  res.render('sign-up', { Title: 'Registro' });
});

app.post('/sign-up', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).send('La cuenta ya existe');
    const newUser = new User({ username, email, password });
    await newUser.save();
    res.redirect('/login');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error al crear cuenta');
  }
});

// Ruta para ver todos los usuarios (solo accesible si el usuario está autenticado)
app.get('/usuarios', ensureAuthenticated, async (req, res) => {
    try {
      const users = await User.find(); // Obtener todos los usuarios de la base de datos
      res.render('usuarios', { Title: 'Usuarios Registrados', users }); // Renderizar la vista con los usuarios
    } catch (error) {
      console.log(error);
      res.status(500).send('Error al cargar los usuarios');
    }
  });

// Ruta de logout
app.get('/logout', (req, res) => {
  req.logout(error => {
    if (error) {
      console.log(error);
      return res.status(500).send('Error al cerrar sesión');
    }
    res.redirect('/');
  });
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { Title: 'Error 404' });
});

