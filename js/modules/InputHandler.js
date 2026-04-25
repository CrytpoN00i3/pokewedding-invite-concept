/**
 * InputHandler - Manages keyboard and touch input
 * Maps physical keys to abstract game actions
 */
export class InputHandler {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this.touchActive = {}; // Track which touch buttons are active

        // Bind keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Bind touch events after DOM is ready
        this.initTouchControls();
    }

    initTouchControls() {
        // Wait for DOM if not ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.bindTouchButtons();
                this.setupJoystick();
            });
        } else {
            this.bindTouchButtons();
            this.setupJoystick();
        }
        
        this.joystickDirection = null; // 'up', 'down', 'left', 'right'
    }

    bindTouchButtons() {
        const buttons = {
            'action-btn': 'Space'
        };

        Object.entries(buttons).forEach(([id, keyCode]) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            // Prevent default touch behaviors
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.simulateKeyDown(keyCode);
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.simulateKeyUp(keyCode);
            }, { passive: false });

            btn.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this.simulateKeyUp(keyCode);
            }, { passive: false });

            // Also support mouse for testing on desktop
            btn.addEventListener('mousedown', () => this.simulateKeyDown(keyCode));
            btn.addEventListener('mouseup', () => this.simulateKeyUp(keyCode));
            btn.addEventListener('mouseleave', () => this.simulateKeyUp(keyCode));
        });
    }

    setupJoystick() {
        const base = document.getElementById('joystick-base');
        const stick = document.getElementById('joystick-stick');
        if (!base || !stick) return;

        let activeTouchId = null;
        let baseRect = null;
        const maxRadius = base.clientWidth / 2;

        const updateStick = (clientX, clientY) => {
            if (!baseRect) baseRect = base.getBoundingClientRect();

            const centerX = baseRect.left + baseRect.width / 2;
            const centerY = baseRect.top + baseRect.height / 2;
            
            let dx = clientX - centerX;
            let dy = clientY - centerY;
            const distance = Math.hypot(dx, dy);

            // Clamp distance to maxRadius
            if (distance > maxRadius) {
                const ratio = maxRadius / distance;
                dx *= ratio;
                dy *= ratio;
            }

            stick.style.transform = `translate(${dx}px, ${dy}px)`;

            let newDir = null;

            // Determine direction based on angle if pushed far enough
            if (distance > maxRadius * 0.3) {
                const angle = Math.atan2(dy, dx);
                // Angle to discrete direction
                if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
                    newDir = 'right';
                } else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
                    newDir = 'down';
                } else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) {
                    newDir = 'up';
                } else {
                    newDir = 'left';
                }
            }
            
            // Handle directional state changes to simulate keypresses
            if (newDir !== this.joystickDirection) {
                // Clear old direction
                if (this.joystickDirection) {
                    const oldKey = this._dirToKey(this.joystickDirection);
                    if (oldKey) this.simulateKeyUp(oldKey);
                }
                
                // Set new direction
                if (newDir) {
                    const newKey = this._dirToKey(newDir);
                    if (newKey) this.simulateKeyDown(newKey);
                }
                
                this.joystickDirection = newDir;
            }
        };

        const stopStick = () => {
            activeTouchId = null;
            if (this.joystickDirection) {
                const oldKey = this._dirToKey(this.joystickDirection);
                if (oldKey) this.simulateKeyUp(oldKey);
            }
            this.joystickDirection = null;
            stick.style.transform = `translate(0px, 0px)`;
        };

        base.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (activeTouchId !== null) return;
            baseRect = base.getBoundingClientRect();
            const touch = e.changedTouches[0];
            activeTouchId = touch.identifier;
            updateStick(touch.clientX, touch.clientY);
            stick.style.transitionDuration = '0ms'; // Remove transition while dragging
        }, { passive: false });

        base.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === activeTouchId) {
                    updateStick(touch.clientX, touch.clientY);
                    break;
                }
            }
        }, { passive: false });

        base.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === activeTouchId) {
                    stick.style.transitionDuration = '150ms'; // Snap back animation
                    stopStick();
                    break;
                }
            }
        }, { passive: false });

        base.addEventListener('touchcancel', stopStick);

        // Desktop testing
        let isMouseDown = false;
        base.addEventListener('mousedown', (e) => {
            isMouseDown = true;
            baseRect = base.getBoundingClientRect();
            updateStick(e.clientX, e.clientY);
            stick.style.transitionDuration = '0ms';
        });
        window.addEventListener('mousemove', (e) => {
            if (isMouseDown) updateStick(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', () => {
            if (isMouseDown) {
                isMouseDown = false;
                stick.style.transitionDuration = '150ms';
                stopStick();
            }
        });
    }

    simulateKeyDown(code) {
        if (!this.keys[code]) {
            this.justPressed[code] = true;
        }
        this.keys[code] = true;
        this.touchActive[code] = true;
    }

    simulateKeyUp(code) {
        this.keys[code] = false;
        this.touchActive[code] = false;
    }

    _dirToKey(dir) {
        switch (dir) {
            case 'up': return 'ArrowUp';
            case 'down': return 'ArrowDown';
            case 'left': return 'ArrowLeft';
            case 'right': return 'ArrowRight';
            default: return null;
        }
    }

    onKeyDown(e) {
        // Prevent default for game keys (arrows, space)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'].includes(e.code)) {
            e.preventDefault();
        }

        // Track "just pressed" for single-fire actions
        if (!this.keys[e.code]) {
            this.justPressed[e.code] = true;
        }
        this.keys[e.code] = true;
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
    }

    // Check if a key is currently held down
    isHeld(action) {
        const keyMap = this.getKeyMap();
        const codes = keyMap[action] || [];
        return codes.some(code => this.keys[code]);
    }

    // Check if a key was just pressed this frame (for menus, interactions)
    isJustPressed(action) {
        const keyMap = this.getKeyMap();
        const codes = keyMap[action] || [];
        return codes.some(code => this.justPressed[code]);
    }

    // Clear "just pressed" state - call at end of each frame
    clearJustPressed() {
        this.justPressed = {};
    }

    // Map abstract actions to physical keys
    getKeyMap() {
        return {
            UP: ['ArrowUp', 'KeyW'],
            DOWN: ['ArrowDown', 'KeyS'],
            LEFT: ['ArrowLeft', 'KeyA'],
            RIGHT: ['ArrowRight', 'KeyD'],
            INTERACT: ['Space', 'Enter', 'KeyE'],
            CANCEL: ['Escape', 'KeyX']
        };
    }

    // Get current direction based on held keys (for movement)
    getDirection() {
        if (this.joystickDirection === 'up' || this.isHeld('UP')) return 'up';
        if (this.joystickDirection === 'down' || this.isHeld('DOWN')) return 'down';
        if (this.joystickDirection === 'left' || this.isHeld('LEFT')) return 'left';
        if (this.joystickDirection === 'right' || this.isHeld('RIGHT')) return 'right';
        return null;
    }
}
