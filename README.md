# Documentazione Backend

## Panoramica
Questo backend fornisce un'API RESTful per un'applicazione di gestione ricette chiamata "Forked". Le principali funzionalità includono:
- Autenticazione utente (registrazione/login)
- Gestione ricette
- Generazione liste della spesa
- Sistema di commenti

## Struttura del Codice

### Dipendenze principali
- `express`: Framework per la creazione dell'API
- `mongodb`: Driver per l'interazione con MongoDB
- `bcryptjs`: Hashing delle password
- `jsonwebtoken`: Gestione token JWT per l'autenticazione
- `cors`: Middleware per abilitare CORS
- `dotenv`: Gestione variabili d'ambiente

### File principali
- `index.js`: File principale che contiene tutta la logica dell'API

## Endpoint API

### Autenticazione

#### `POST /forked/auth/register`
Registra un nuovo utente.

**Parametri richiesti:**
- `email`: Email dell'utente
- `password`: Password
- `name`: Nome dell'utente

**Risposta di successo:**
```json
{
    "token": "JWT_TOKEN",
    "user": {
        "id": "USER_ID",
        "name": "USER_NAME",
        "email": "USER_EMAIL"
    }
}
```

#### `POST /forked/auth/login`
Login utente esistente.

**Parametri richiesti:**
- `email`: Email dell'utente
- `password`: Password

**Risposta di successo:**
```json
{
    "token": "JWT_TOKEN",
    "user": {
        "id": "USER_ID",
        "name": "USER_NAME",
        "email": "USER_EMAIL"
    }
}
```

### Ricette

#### `GET /forked/ricette`
Ottiene tutte le ricette disponibili con informazioni sul creatore.

**Risposta di successo:**
```json
[
    {
        "_id": "RECIPE_ID",
        "name": "RECIPE_NAME",
        "ingredients": [...],
        "instructions": "...",
        "createdAt": "DATE",
        "updatedAt": "DATE",
        "creatore": {
            "name": "CREATOR_NAME",
            "_id": "CREATOR_ID"
        }
    }
]
```

#### `POST /forked/recipies` (protetto)
Crea una nuova ricetta. Richiede autenticazione.

**Parametri richiesti:**
- `name`: Nome ricetta
- `ingredients`: Array di ingredienti
- `instructions`: Istruzioni per preparazione

**Risposta di successo:**
```json
{
    "_id": "RECIPE_ID",
    "name": "RECIPE_NAME",
    "ingredients": [...],
    "instructions": "...",
    "userId": "USER_ID",
    "createdAt": "DATE",
    "updatedAt": "DATE"
}
```

#### `GET /forked/myrecipies` (protetto)
Ottiene tutte le ricette create dall'utente loggato.

**Risposta di successo:**
```json
[
    {
        "_id": "RECIPE_ID",
        "name": "RECIPE_NAME",
        "ingredients": [...],
        "instructions": "...",
        "userId": "USER_ID",
        "createdAt": "DATE",
        "updatedAt": "DATE"
    }
]
```

### Liste della Spesa

#### `POST /forked/lista-spesa`
Genera una lista della spesa basata su ricette selezionate e numero di persone.

**Parametri richiesti:**
- `ricette`: Array di ID ricette
- `persone`: Numero di persone

**Risposta di successo:**
```json
{
    "listaSpesa": [
        {
            "nome": "INGREDIENT_NAME",
            "quantita": QUANTITY,
            "unita": "UNIT"
        }
    ],
    "ricette": ["RECIPE_NAME_1", "RECIPE_NAME_2"]
}
```

#### `GET /forked/lista-spesa`
Versione alternativa che accetta parametri via query string.

**Parametri query:**
- `ricette`: ID ricette separati da virgola
- `persone`: Numero di persone

**Risposta di successo:**
```json
{
    "ricette": ["RECIPE_NAME_1", "RECIPE_NAME_2"],
    "listaSpesa": [...],
    "persone": NUMBER,
    "createdAt": "DATE"
}
```

### Profilo Utente

#### `GET /forked/users/profile` (protetto)
Ottiene il profilo dell'utente loggato.

**Risposta di successo:**
```json
{
    "_id": "USER_ID",
    "email": "USER_EMAIL",
    "name": "USER_NAME",
    "createdAt": "DATE",
    "updatedAt": "DATE"
}
```

#### `PUT /forked/users/profile` (protetto)
Aggiorna il profilo utente.

**Parametri opzionali:**
- `name`: Nuovo nome
- `email`: Nuova email

**Risposta di successo:**
```json
{
    "message": "Profilo aggiornato"
}
```

### Commenti

#### `POST /forked/ricette/:nome/commenti` (protetto)
Aggiunge un commento a una ricetta.

**Parametri richiesti:**
- `testo`: Testo del commento

**Risposta di successo:**
```json
{
    "_id": "COMMENT_ID",
    "nomeRicetta": "RECIPE_NAME",
    "userId": "USER_ID",
    "userNome": "USER_NAME",
    "testo": "COMMENT_TEXT",
    "createdAt": "DATE"
}
```

#### `GET /forked/ricette/:nome/commenti`
Ottiene tutti i commenti per una ricetta.

**Risposta di successo:**
```json
[
    {
        "_id": "COMMENT_ID",
        "testo": "COMMENT_TEXT",
        "createdAt": "DATE",
        "user": {
            "_id": "USER_ID",
            "name": "USER_NAME"
        }
    }
]
```

#### `DELETE /forked/ricette/:nome/commenti/:id` (protetto)
Elimina un commento (solo per l'autore).

**Risposta di successo:**
```json
{
    "message": "Commento eliminato"
}
```

## Autenticazione
Tutti gli endpoint protetti richiedono un header `Authorization` con un token JWT valido:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

## Variabili d'Ambiente
Il progetto richiede le seguenti variabili d'ambiente:
- `MONGODB_URI`: URI di connessione a MongoDB
- `JWT_SECRET`: Segreto per firmare i token JWT
- `PORT`: Porta su cui avviare il server (opzionale, default 6000)

## Gestione Errori
Il backend include un middleware per la gestione degli errori che:
- Logga gli errori sul server
- Restituisce risposte appropriate al client

## Avvio del Server
1. Configurare le variabili d'ambiente
2. Eseguire `node index.js`
3. Il server sarà disponibile sulla porta specificata (default: 6000)

## Considerazioni sulla Sicurezza
- Password memorizzate con hash bcrypt
- Autenticazione basata su JWT con scadenza
- Validazione degli input
- Protezione degli endpoint sensibili
- Gestione sicura degli errori
