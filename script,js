const menuToggle = document.getElementById("menuToggle");
const menu = document.querySelector(".menu");

menuToggle.addEventListener("click", function () {
    menu.classList.toggle("open");
});

const menuLinks = document.querySelectorAll(".menu a");

for (let i = 0; i < menuLinks.length; i++) {
    menuLinks[i].addEventListener("click", function () {
        menu.classList.remove("open");
    });
}

const communityBtn = document.getElementById("communityBtn");
const toast = document.getElementById("toast");

communityBtn.addEventListener("click", function () {
    mostrarMensagem("Bem-vindo à comunidade Team Bots!");
});

const perguntas = document.querySelectorAll(".faq-question");

for (let i = 0; i < perguntas.length; i++) {
    perguntas[i].addEventListener("click", function () {
        const item = perguntas[i].parentElement;

        item.classList.toggle("active");
    });
}

function mostrarMensagem(texto) {
    toast.textContent = texto;
    toast.classList.add("show");

    setTimeout(function () {
        toast.classList.remove("show");
    }, 2500);
}
