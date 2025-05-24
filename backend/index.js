require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const auth = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');


app.use(errorHandler);

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

// Registrazione
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


// Login
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

// Homepage
app.get('/', (req, res) => {
    res.json({ 
        message: 'Forked API is running 🍴🚀',
        docs: 'Vai a /forked/... per usare le API' 
    });
});

// Visualizza ricette
app.get('/forked/recipes', async (req, res) => {
    try {
        const ricette = await db.collection('ricette').aggregate([
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
                    imageUrl: 1, // Aggiungi questo campo
                    createdAt: 1,
                    updatedAt: 1,
                    "creatore.name": 1,
                    "creatore._id": 1
                }
            }
        ]).toArray();

        res.json(ricette);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nel recupero delle ricette' });
    }
});

// GET - Dettaglio singola ricetta
app.get('/forked/recipes/:name', async (req, res) => {
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

// Aggiungi ricetta
app.post('/forked/recipes', auth, async (req, res) => {
    try {
        const { name, ingredients, instructions, imageUrl } = req.body;

        if (!name || !ingredients || !instructions) {
            return res.status(400).json({ message: 'Dati mancanti' });
        }

        const ricetta = {
            name,
            ingredients,
            instructions,
            imageUrl: imageUrl || null, // Aggiungi questo campo
            userId: req.user._id,
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

// DELETE - Elimina ricetta (solo il proprietario può eliminare)
app.delete('/forked/recipes/:name', auth, async (req, res) => {
    try {
        const ricettaId = req.params.id;

        // Verifica che la ricetta esista e appartenga all'utente
        const ricetta = await db.collection('ricette').findOne({
            _id: new ObjectId(ricettaId),
            userId: req.user._id
        });

        if (!ricetta) {
            return res.status(404).json({ 
                message: 'Ricetta non trovata o non autorizzato' 
            });
        }

        // Elimina la ricetta
        const result = await db.collection('ricette').deleteOne({
            _id: new ObjectId(ricettaId)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        // Opzionale: elimina anche i commenti associati
        await db.collection('commenti').deleteMany({
            nomeRicetta: ricetta.name
        });

        res.json({ message: 'Ricetta eliminata con successo' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nell\'eliminazione della ricetta' });
    }
});

// PUT - Modifica ricetta (solo il proprietario può modificare)
app.put('/forked/recipes/:name', auth, async (req, res) => {
    try {
        const ricettaId = req.params.id;
        const { name, ingredients, instructions, imageUrl } = req.body;

        // Verifica che la ricetta esista e appartenga all'utente
        const ricettaEsistente = await db.collection('ricette').findOne({
            _id: new ObjectId(ricettaId),
            userId: req.user._id
        });

        if (!ricettaEsistente) {
            return res.status(404).json({ 
                message: 'Ricetta non trovata o non autorizzato' 
            });
        }

        // Prepara gli aggiornamenti
        const updates = {
            updatedAt: new Date()
        };

        if (name) updates.name = name;
        if (ingredients) updates.ingredients = ingredients;
        if (instructions) updates.instructions = instructions;
        if (imageUrl !== undefined) updates.imageUrl = imageUrl;

        // Aggiorna la ricetta
        const result = await db.collection('ricette').updateOne(
            { _id: new ObjectId(ricettaId) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        // Se è cambiato il nome, aggiorna i commenti associati
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

// Generazione lista della spesa
app.post('/forked/lista-spesa', async (req, res) => {
    try {
        const { ricette, persone } = req.body;

        if (!ricette || !Array.isArray(ricette) || ricette.length === 0 ||
            !persone || isNaN(persone) || persone < 1) {
            return res.status(400).json({ message: 'Dati non validi' });
        }

        const ricetteIds = ricette.map(id => new ObjectId(id));
        const ricetteSelezionate = await db.collection('ricette')
            .find({ _id: { $in: ricetteIds } })
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

        res.json({
            listaSpesa: Object.values(listaSpesa),
            ricette: ricetteSelezionate.map(r => r.name)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nella generazione della lista' });
    }
});

// GET - Visualizza lista della spesa (con query params)
app.get('/forked/lista-spesa', async (req, res) => {
    try {
        const { ricette, persone } = req.query;

        // Validazione input
        if (!ricette || !persone || isNaN(persone)) {
            return res.status(400).json({ 
                message: 'Parametri mancanti: ricette (ID separati da virgola) e persone (numero)' 
            });
        }

        const ricetteIds = ricette.split(',').map(id => new ObjectId(id));
        const numPersone = parseInt(persone);

        // Recupera le ricette dal DB
        const ricetteSelezionate = await db.collection('ricette')
            .find({ _id: { $in: ricetteIds } })
            .toArray();

        if (ricetteSelezionate.length !== ricetteIds.length) {
            return res.status(404).json({ message: 'Alcune ricette non trovate' });
        }

        // Calcola la lista della spesa
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

        // Formatta la risposta
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

// GET - Dettaglio utente
app.get('/forked/users/profile', auth, async (req, res) => {
    try {
        // Escludi la password dalla risposta
        const user = await db.collection('users').findOne(
            { _id: req.user._id },
            { projection: { password: 0 } }
        );
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Errore nel recupero del profilo' });
    }
});

// PUT - Aggiorna profilo (protetto)
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

// Visualizza ricette dell'utente loggato
app.get('/forked/myrecipes', auth, async (req, res) => {
    try {
        const ricette = await db.collection('ricette').find({
            userId: req.user._id
        }, {
            projection: {
                name: 1,
                ingredients: 1,
                instructions: 1,
                imageUrl: 1, // Aggiungi questo campo
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

// POST - Aggiungi commento 
app.post('/forked/ricette/:nome/commenti', auth, async (req, res) => {
    try {
        const { testo } = req.body;
        const nomeRicetta = decodeURIComponent(req.params.nome); // Decodifica spazi/caratteri speciali

        if (!testo || testo.trim() === '') {
            return res.status(400).json({ message: 'Il commento non può essere vuoto' });
        }

        // Verifica che la ricetta esista
        const ricetta = await db.collection('ricette').findOne({
            name: nomeRicetta
        });
        if (!ricetta) {
            return res.status(404).json({ message: 'Ricetta non trovata' });
        }

        // Ottieni dati utente
        const user = await db.collection('users').findOne(
            { _id: req.user._id },
            { projection: { name: 1 } }
        );

        const commento = {
            nomeRicetta,
            userId: req.user._id,
            userNome: user.name, // Cache del nome utente
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

// GET - Ottieni commenti di una ricetta 
app.get('/forked/ricette/:nome/commenti', async (req, res) => {
    try {
        const nomeRicetta = decodeURIComponent(req.params.nome);

        const commenti = await db.collection('commenti')
            .find({ nomeRicetta })
            .sort({ createdAt: -1 }) // Dal più recente
            .toArray();

        res.json(commenti.map(c => ({
            _id: c._id,
            testo: c.testo,
            createdAt: c.createdAt,
            user: {
                _id: c.userId,
                name: c.userNome // Usa il campo cached
            }
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Errore nel recupero dei commenti' });
    }
});

// DELETE - Elimina commento 
app.delete('/forked/ricette/:nome/commenti/:id', auth, async (req, res) => {
    try {
        const nomeRicetta = decodeURIComponent(req.params.nome);
        const commentId = req.params.id;

        const result = await db.collection('commenti').deleteOne({
            _id: new ObjectId(commentId),
            nomeRicetta,
            userId: req.user._id // Solo l'autore può eliminare
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

// Connessione al database e avvio server
connectToDatabase().then(() => {
    const PORT = process.env.PORT || 6000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
});
