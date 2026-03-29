const broom = document.getElementById('broomstick');
const nav = document.querySelector('nav');
const hero = document.querySelector('.hero');
const sortingHat = document.getElementById('sorting-hat');
const faqChatbot = document.getElementById('faq-chatbot');
const faqCloseButton = document.querySelector('.faq-close');
const faqAnswer = document.getElementById('faq-answer');
const faqQuestions = Array.from(document.querySelectorAll('.faq-question'));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let lastSparkBucket = -1;
let ticking = false;

const faqAnswers = {
    'what-is-it': 'Focus Pilot is a context-aware orchestration layer that reduces distraction by coordinating notifications, actions, and app signals across tools like VS Code, Chrome, and Gmail.',
    'how-it-works': 'It uses extensions and a desktop orchestrator to intercept signals, score user focus locally, and decide whether alerts should surface now, wait, or trigger actions in another app.',
    'why-useful': 'The main benefit is fewer context switches. Instead of checking every tool manually, the system routes only the right information at the right time so deep work is protected.',
    'downloads': 'This concept includes three artifacts: The Pulse for VS Code, The Core desktop orchestrator, and The Sight Chrome extension, each representing a different layer of the workflow.',
    mobile: 'Yes. The project aims for a unified experience across desktop productivity tools and mobile-style notification flows, so updates can stay coordinated beyond a single screen.'
};

if (finePointer) {
    const wand = document.createElement('div');
    wand.id = 'magic-wand';
    const tip = document.createElement('div');
    tip.id = 'wand-tip';
    document.body.appendChild(wand);
    document.body.appendChild(tip);

    window.addEventListener('mousemove', (event) => {
        wand.style.left = event.clientX + 'px';
        wand.style.top = event.clientY + 'px';
        tip.style.left = event.clientX + 'px';
        tip.style.top = event.clientY + 'px';
    });
}

function setChatbotOpen(isOpen) {
    if (!sortingHat || !faqChatbot) {
        return;
    }

    sortingHat.setAttribute('aria-expanded', String(isOpen));
    faqChatbot.setAttribute('aria-hidden', String(!isOpen));
    faqChatbot.classList.toggle('is-open', isOpen);
}

function setActiveFaq(key) {
    if (!faqAnswer || !faqAnswers[key]) {
        return;
    }

    faqAnswer.textContent = faqAnswers[key];

    faqQuestions.forEach((button) => {
        const isActive = button.dataset.faqKey === key;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });
}

if (sortingHat && faqChatbot && faqCloseButton && faqQuestions.length > 0) {
    sortingHat.addEventListener('click', () => {
        const isOpen = !faqChatbot.classList.contains('is-open');
        setChatbotOpen(isOpen);
    });

    faqCloseButton.addEventListener('click', () => {
        setChatbotOpen(false);
    });

    faqQuestions.forEach((button) => {
        button.addEventListener('click', () => {
            setActiveFaq(button.dataset.faqKey);
        });
    });

    document.addEventListener('click', (event) => {
        const target = event.target;

        if (
            faqChatbot.classList.contains('is-open') &&
            target instanceof Node &&
            !faqChatbot.contains(target) &&
            !sortingHat.contains(target)
        ) {
            setChatbotOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setChatbotOpen(false);
        }
    });

    setActiveFaq('what-is-it');
}

function updateScene() {
    if (!broom || !nav || !hero) {
        return;
    }

    const scrollPos = window.scrollY;
    const totalHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const scrollPercent = Math.min(scrollPos / totalHeight, 1);
    const xPos = scrollPercent * (window.innerWidth + 480);
    const yOsc = Math.sin(scrollPos * 0.0022) * Math.min(window.innerHeight * 0.12, 110);
    const tilt = -18 + (scrollPercent * 22);

    broom.style.transform = `translate3d(${xPos}px, ${yOsc}px, 0) rotate(${tilt}deg)`;

    const heroBottom = hero.getBoundingClientRect().bottom;
    nav.classList.toggle('nav-scrolled', heroBottom <= nav.offsetHeight + 24);

    if (!prefersReducedMotion && window.innerWidth > 640) {
        const sparkBucket = Math.floor(scrollPos / 140);

        if (sparkBucket !== lastSparkBucket && scrollPos > 0) {
            lastSparkBucket = sparkBucket;
            const broomRect = broom.getBoundingClientRect();
            createSpark(
                broomRect.left + (broomRect.width * 0.72),
                broomRect.top + (broomRect.height * 0.52)
            );
        }
    }
}

function createSpark(x, y) {
    const spark = document.createElement('div');
    spark.className = 'magic-spark';
    spark.style.left = x + 'px';
    spark.style.top = y + 'px';
    document.body.appendChild(spark);

    window.setTimeout(() => spark.remove(), 1000);
}

function queueSceneUpdate() {
    if (ticking) {
        return;
    }

    ticking = true;
    window.requestAnimationFrame(() => {
        updateScene();
        ticking = false;
    });
}

window.addEventListener('scroll', queueSceneUpdate, { passive: true });
window.addEventListener('resize', queueSceneUpdate);
window.addEventListener('load', updateScene);

updateScene();
