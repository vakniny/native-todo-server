import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import helmet from 'helmet'
import process from 'process'
import listsRouter from './routes/lists'
import { apiLimiter } from './middleware/rateLimit'

const app = express()

app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1)

app.use(helmet())

// Wildcard CORS lets any web page drive the API. Allow only the origins we ship
// from; with no ALLOWED_ORIGINS set, non-browser clients (the mobile app) still
// work because they send no Origin header.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean)

app.use(
	cors({
		// Returning false (rather than an Error) omits the CORS headers so the
		// browser blocks the response, without turning the request into a 500 that
		// renders a stack trace.
		origin: (origin, callback) => {
			if (!origin) return callback(null, true)
			callback(null, allowedOrigins.includes(origin))
		},
	}),
)

// Nothing this API accepts is anywhere near the 100kb express default.
app.use(express.json({ limit: '16kb' }))

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/todo-app'
const PORT = Number(process.env.PORT) || 3000

if (MONGO_URI.includes('YOUR_PASSWORD') || MONGO_URI.includes('<password>')) {
	console.error(
		'❌ MONGO_URI still has a placeholder password. Update server/.env with your Atlas password.',
	)
}

mongoose
	.connect(MONGO_URI)
	.then(() => console.log('✅ Connected to MongoDB'))
	.catch((err) => console.error('❌ MongoDB connection error:', err))

app.use('/api', apiLimiter)
app.use('/api/lists', listsRouter)

app.use((_req, res) => {
	res.status(404).json({ message: 'Not found' })
})

// Express's default handler renders an HTML stack trace, which leaks absolute
// paths and dependency internals (e.g. on a body-too-large rejection). Always
// answer with generic JSON and keep the detail in the server log.
app.use(
	(
		error: Error & { status?: number; statusCode?: number; type?: string },
		_req: express.Request,
		res: express.Response,
		next: express.NextFunction,
	) => {
		if (res.headersSent) return next(error)

		const status = error.status ?? error.statusCode ?? 500
		console.error('[error]', status, error.message)

		if (status === 413) {
			res.status(413).json({ message: 'Request body too large' })
			return
		}
		if (error.type === 'entity.parse.failed') {
			res.status(400).json({ message: 'Malformed JSON body' })
			return
		}
		res.status(status >= 400 && status < 600 ? status : 500).json({
			message: 'Something went wrong',
		})
	},
)

app.listen(PORT, '0.0.0.0', () => {
	console.log(`🚀 Server is running on port ${PORT}`)
})
