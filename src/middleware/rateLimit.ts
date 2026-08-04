import rateLimit from 'express-rate-limit'

// Invite codes are the only secret protecting a folder, so the two routes that
// accept one get a tight budget: brute-forcing the code space has to be slow.
export const joinLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { message: 'Too many attempts. Try again later.' },
})

// Broad ceiling for everything else. Generous enough for the 5s todo poll
// (~180 requests / 15 min per open folder) while still capping abuse.
export const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 1000,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { message: 'Too many requests. Slow down.' },
})
