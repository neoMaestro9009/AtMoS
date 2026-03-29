// types/index.ts

// AtMoS Biometric System Types

// Interface for User Information
export interface User {
    id: string;
    name: string;
    email: string;
    biometricData: BiometricData;
}

// Interface for Biometric Data
export interface BiometricData {
    fingerprint?: string;
    facialRecognition?: string;
    irisScan?: string;
}

// Interface for Authentication
export interface Authentication {
    userId: string;
    timestamp: string;
    status: 'success' | 'failure';
}

// Interface for Access Control
export interface AccessControl {
    userId: string;
    accessGranted: boolean;
    grantTimestamp: string;
    revokeTimestamp?: string;
}

// Type definition for Biometric Types
export type BiometricType = 'fingerprint' | 'facialRecognition' | 'irisScan';

// Overall System Status
export interface SystemStatus {
    operational: boolean;
    lastChecked: string;
}
