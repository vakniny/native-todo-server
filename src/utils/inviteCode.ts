import { randomInt } from 'crypto'
import { List } from '../models/List'

// Excludes 0/O and 1/I to avoid ambiguity when read aloud or typed from a screen.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODE_LENGTH = 8
const MAX_ATTEMPTS = 5

// Accepts 6 chars so codes minted before the length bump keep working; new
// codes are always CODE_LENGTH.
export const INVITE_CODE_PATTERN = new RegExp(`^[${ALPHABET}]{6,${CODE_LENGTH}}$`)

export const isValidInviteCode = (value: unknown): value is string =>
	typeof value === 'string' && INVITE_CODE_PATTERN.test(value)

// randomInt is CSPRNG-backed; Math.random is not and would let anyone who has
// seen a few codes predict the ones issued to other people.
const generateCode = (): string => {
	let code = ''
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += ALPHABET[randomInt(ALPHABET.length)]
	}
	return code
}

export const createUniqueInviteCode = async (): Promise<string> => {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const code = generateCode()
		const existing = await List.findOne({ inviteCode: code })
		if (!existing) {
			return code
		}
	}
	throw new Error('Failed to generate a unique invite code')
}
