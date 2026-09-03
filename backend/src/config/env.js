const requiredEnvVars = [
    'MONGO_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
];

// Extra vars required only in production
const productionOnlyVars = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'FRONTEND_URL',
];

export const validateEnv = () => {
    const missing = requiredEnvVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (process.env.NODE_ENV === 'production') {
        const missingProd = productionOnlyVars.filter((key) => !process.env[key]);
        if (missingProd.length > 0) {
            throw new Error(`Missing production environment variables: ${missingProd.join(', ')}`);
        }
    }

    console.log('Environment variables validated successfully');
};
