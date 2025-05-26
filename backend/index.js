require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// Debug: Log Express version
console.log('Express version:', require('express/package.json').version);

const corsOptions = {
  origin: ['https://forked-front.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept'
  ],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://forked-front.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import middleware with error handling
let auth, errorHandler;
try {
  auth = require('./middlewares/auth');
  errorHandler = require('./middlewares/errorHandler');
} catch (error) {
  console.warn('Middleware import failed:', error.message);
  // Fallback auth middleware
  auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Token mancante' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { _id: new ObjectId(decoded.id) };
      next();
    } catch (error) {
      res.status(401).json({ message: 'Token non valido' });
    }
  };
  
  // Fallback error handler
  errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Errore del server' });
  };
}

app.use(errorHandler);

// HTTPS redirect middleware
app.use((req, res, next) => {
  if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});

// Verifica variabili d'ambiente
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    console.error('Mancano variabili d\'ambiente necessarie!');
    process.exit(1);
}

// Connessione al database
let db;
const connectToDatabase = async () => {
    try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        db = client.db('Forked');
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
};

// Homepage - Test route
console.log('Setting up route: GET /');
app.get('/', (req, res) => {
    res.json({ 
        message: 'Forked API is running 🍴🚀',
        docs: 'Vai a /forked/... per usare le API' 
    });
});

// Auth routes
console.log('Setting up route: POST /forked/auth/register');
app.post('/forked/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ message: 'Dati mancanti' });
        }

        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Utente già esistente' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            email,
            password: hashedPassword,
            name,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('users').insertOne(user);
        const token = jwt.sign({ id: result.insertedId }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        });

        res.status(201).json({ token, user: { id: result.insertedId, name, email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

console.log('Setting up route: POST /forked/auth/login');
app.post('/forked/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email e password richieste' });
        }

        const user = await db.collection('users').findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Credenziali non valide' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenziali non valide' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        });

        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore del server' });
    }
});

// Basic recipe routes
console.log('Setting up route: GET /forked/recipes');
app.get('/forked/recipes', async (req, res) => {
    try {
        const ricette = await db.collection('ricette').find().toArray();
        res.json(ricette);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nel recupero delle ricette' });
    }
});

console.log('Setting up route: POST /forked/recipes');
app.post('/forked/recipes', auth, async (req, res) => {
    try {
        const { name, ingredients, instructions, imageUrl } = req.body;
        if (!name || !ingredients || !instructions) {
            return res.status(400).json({ message: 'Dati mancanti' });
        }
        
        const user = await db.collection('users').findOne({ _id: req.user._id });
        if (!user) {
            return res.status(404).json({ message: 'Utente non trovato' });
        }
        
        const ricetta = {
            name,
            ingredients,
            instructions,
            imageUrl: imageUrl || null,
            userId: req.user._id,
            userName: user.name || user.username || 'Utente sconosciuto',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await db.collection('ricette').insertOne(ricetta);
        ricetta._id = result.insertedId;
        res.status(201).json(ricetta);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nella creazione della ricetta' });
    }
});

// User routes
console.log('Setting up route: GET /forked/users/profile');
app.get('/forked/users/profile', auth, async (req, res) => {
    try {
        const user = await db.collection('users').findOne(
            { _id: req.user._id },
            { projection: { password: 0 } }
        );
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Errore nel recupero del profilo' });
    }
});

console.log('Setting up route: PUT /forked/users/profile');
app.put('/forked/users/profile', auth, async (req, res) => {
    try {
        const { name, email } = req.body;
        const updates = { updatedAt: new Date() };
        if (name) updates.name = name;
        if (email) updates.email = email;

        await db.collection('users').updateOne(
            { _id: req.user._id },
            { $set: updates }
        );
        res.json({ message: 'Profilo aggiornato' });
    } catch (error) {
        res.status(500).json({ message: 'Errore nell\'aggiornamento' });
    }
});

console.log('Setting up route: GET /forked/myrecipes');
app.get('/forked/myrecipes', auth, async (req, res) => {
    try {
        const ricette = await db.collection('ricette').find({
            userId: req.user._id
        }, {
            projection: {
                name: 1,
                ingredients: 1,
                instructions: 1,
                imageUrl: 1,
                createdAt: 1,
                updatedAt: 1
            }
        }).toArray();

        res.json(ricette);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nel recupero delle tue ricette' });
    }
});

// Lista spesa routes
console.log('Setting up route: GET /forked/lista-spesa');
app.get('/forked/lista-spesa', async (req, res) => {
    try {
        const { ricette, persone } = req.query;

        if (!ricette || !persone || isNaN(persone)) {
            return res.status(400).json({ 
                message: 'Parametri mancanti: ricette (nomi separati da virgola) e persone (numero)' 
            });
        }

        const ricetteNomi = ricette.split(',');
        const numPersone = parseInt(persone);

        const ricetteSelezionate = await db.collection('ricette')
            .find({ name: { $in: ricetteNomi } })
            .toArray();

        if (ricetteSelezionate.length !== ricetteNomi.length) {
            return res.status(404).json({ message: 'Alcune ricette non trovate' });
        }

        const listaSpesa = {};
        ricetteSelezionate.forEach(ricetta => {
            ricetta.ingredients.forEach(ingrediente => {
                const key = `${ingrediente.nome}-${ingrediente.unita}`;
                listaSpesa[key] = listaSpesa[key] || {
                    nome: ingrediente.nome,
                    quantita: 0,
                    unita: ingrediente.unita
                };
                listaSpesa[key].quantita += ingrediente.quantita * numPersone;
            });
        });

        res.json({
            ricette: ricetteSelezionate.map(r => r.name),
            listaSpesa: Object.values(listaSpesa),
            persone: numPersone,
            createdAt: new Date()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nella generazione della lista' });
    }
});

console.log('Setting up route: POST /forked/lista-spesa');
app.post('/forked/lista-spesa', async (req, res) => {
    try {
        const { ricette, persone } = req.body;

        if (!ricette || !Array.isArray(ricette) || ricette.length === 0 ||
            !persone || isNaN(persone) || persone < 1) {
            return res.status(400).json({ message: 'Dati non validi' });
        }

        const ricetteSelezionate = await db.collection('ricette')
            .find({ name: { $in: ricette } })
            .toArray();

        if (ricetteSelezionate.length !== ricette.length) {
            return res.status(404).json({ message: 'Alcune ricette non trovate' });
        }

        const listaSpesa = {};
        ricetteSelezionate.forEach(ricetta => {
            ricetta.ingredients.forEach(ingrediente => {
                const key = `${ingrediente.nome}-${ingrediente.unita}`;
                listaSpesa[key] = listaSpesa[key] || {
                    nome: ingrediente.nome,
                    quantita: 0,
                    unita: ingrediente.unita
                };
                listaSpesa[key].quantita += ingrediente.quantita * persone;
            });
        });

        const documentoLista = {
            listaSpesa: Object.values(listaSpesa),
            ricette: ricetteSelezionate.map(r => r.name),
            persone,
            createdAt: new Date()
        };

        await db.collection('liste-spesa').insertOne(documentoLista);

        res.json(documentoLista);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nella generazione della lista' });
    }
});

// SAFE RECIPE ROUTES - Using IDs instead of names in URLs
console.log('Setting up route: GET /forked/recipes/by-id/:id');
app.get('/forked/recipes/by-id/:id', async (req, res) => {
    try {
        const ricettaId = req.params.id;

        const ricetta = await db.collection('ricette').aggregate([
            {
                $match: { _id: new ObjectId(ricettaId) }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "creatore"
                }
            },
            {
                $unwind: "$creatore"
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    ingredients: 1,
                    instructions: 1,
                    imageUrl: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    "creatore.name": 1,
                    "creatore._id": 1
                }
            }
        ]).next();

        if (!ricetta) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        res.json(ricetta);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nel recupero della ricetta' });
    }
});

console.log('Setting up route: DELETE /forked/recipes/by-id/:id');
app.delete('/forked/recipes/by-id/:id', auth, async (req, res) => {
    try {
        const ricettaId = req.params.id;

        const ricetta = await db.collection('ricette').findOne({
            _id: new ObjectId(ricettaId),
            userId: req.user._id
        });

        if (!ricetta) {
            return res.status(404).json({ 
                message: 'Ricetta non trovata o non autorizzato' 
            });
        }

        const result = await db.collection('ricette').deleteOne({
            _id: new ObjectId(ricettaId)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        await db.collection('commenti').deleteMany({
            nomeRicetta: ricetta.name
        });

        res.json({ message: 'Ricetta eliminata con successo' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nell\'eliminazione della ricetta' });
    }
});

console.log('Setting up route: PUT /forked/recipes/by-id/:id');
app.put('/forked/recipes/by-id/:id', auth, async (req, res) => {
    try {
        const ricettaId = req.params.id;
        const { name, ingredients, instructions, imageUrl } = req.body;

        const ricettaEsistente = await db.collection('ricette').findOne({
            _id: new ObjectId(ricettaId),
            userId: req.user._id
        });

        if (!ricettaEsistente) {
            return res.status(404).json({ 
                message: 'Ricetta non trovata o non autorizzato' 
            });
        }

        const updates = {
            updatedAt: new Date()
        };

        if (name) updates.name = name;
        if (ingredients) updates.ingredients = ingredients;
        if (instructions) updates.instructions = instructions;
        if (imageUrl !== undefined) updates.imageUrl = imageUrl;

        const result = await db.collection('ricette').updateOne(
            { _id: new ObjectId(ricettaId) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        if (name && name !== ricettaEsistente.name) {
            await db.collection('commenti').updateMany(
                { nomeRicetta: ricettaEsistente.name },
                { $set: { nomeRicetta: name } }
            );
        }

        res.json({ message: 'Ricetta aggiornata con successo' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nell\'aggiornamento della ricetta' });
    }
});

// COMMENT ROUTES - Using request body instead of URL parameters
console.log('Setting up route: POST /forked/comments');
app.post('/forked/comments', auth, async (req, res) => {
    try {
        const { testo, nomeRicetta } = req.body;

        if (!testo || testo.trim() === '') {
            return res.status(400).json({ message: 'Il commento non può essere vuoto' });
        }

        if (!nomeRicetta) {
            return res.status(400).json({ message: 'Nome ricetta mancante' });
        }

        const ricetta = await db.collection('ricette').findOne({
            name: nomeRicetta
        });
        if (!ricetta) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        const user = await db.collection('users').findOne(
            { _id: req.user._id },
            { projection: { name: 1 } }
        );

        const commento = {
            nomeRicetta,
            userId: req.user._id,
            userNome: user.name,
            testo,
            createdAt: new Date()
        };

        const result = await db.collection('commenti').insertOne(commento);
        commento._id = result.insertedId;

        res.status(201).json(commento);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nell\'aggiunta del commento' });
    }
});

console.log('Setting up route: GET /forked/comments');
app.get('/forked/comments', async (req, res) => {
    try {
        const { nomeRicetta } = req.query;
        
        if (!nomeRicetta) {
            return res.status(400).json({ message: 'Nome ricetta mancante' });
        }

        const commenti = await db.collection('commenti')
            .find({ nomeRicetta })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(commenti.map(c => ({
            _id: c._id,
            testo: c.testo,
            createdAt: c.createdAt,
            user: {
                _id: c.userId,
                name: c.userNome
            }
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nel recupero dei commenti' });
    }
});

console.log('Setting up route: DELETE /forked/comments/:id');
app.delete('/forked/comments/:id', auth, async (req, res) => {
    try {
        const { nomeRicetta } = req.query;
        const commentId = req.params.id;

        if (!nomeRicetta) {
            return res.status(400).json({ message: 'Nome ricetta mancante' });
        }

        const result = await db.collection('commenti').deleteOne({
            _id: new ObjectId(commentId),
            nomeRicetta,
            userId: req.user._id
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                message: 'Commento non trovato o non autorizzato' 
            });
        }

        res.json({ message: 'Commento eliminato' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nell\'eliminazione' });
    }
});

console.log('All routes set up successfully!');

// Connessione al database e avvio server
connectToDatabase().then(() => {
    const PORT = process.env.PORT || 6000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
