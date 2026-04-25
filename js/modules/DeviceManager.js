/**
 * DeviceManager.js
 * Handles device detection, orientation changes, and viewport sizing
 */
export class DeviceManager {
    constructor() {
        this.isMobile = false;
        this.orientation = 'portrait';
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.init();
    }

    init() {
        this.checkDevice();
        this.updateViewportHeight();

        window.addEventListener('resize', () => {
            this.checkDevice();
            this.updateViewportHeight();
        });

        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.checkDevice();
                this.updateViewportHeight();
            }, 100);
        });
    }

    checkDevice() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.orientation = this.width > this.height ? 'landscape' : 'portrait';

        // Simple heuristic for mobile: width < 768px or touch capability
        // Note: Tablets might fall into desktop bucket size-wise but have touch
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.isMobile = this.width < 768 || hasTouch;

        document.documentElement.setAttribute('data-device', this.isMobile ? 'mobile' : 'desktop');
        document.documentElement.setAttribute('data-orientation', this.orientation);
    }

    // Fix for 100vh on mobile browsers including URL bar
    updateViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    get deviceState() {
        return {
            isMobile: this.isMobile,
            orientation: this.orientation,
            width: this.width,
            height: this.height
        };
    }
}
