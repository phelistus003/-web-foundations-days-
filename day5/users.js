const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

let users = [];

async function loadUsers() {
  statusEl.textContent = "Loading users...";
  loadButton.disabled = true;

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");

    if (!response.ok) {
      throw new Error("Request failed with status " + response.status);
    }

    users = await response.json();
    renderUsers(users);
    statusEl.textContent = "Loaded " + users.length + " users.";
  } catch (error) {
    statusEl.textContent = "Could not load users. " + error.message;
  } finally {
    loadButton.disabled = false;
  }
}

function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.appendChild(empty);
    return;
  }

  list.forEach(function (user) {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("p");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("p");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("p");
    company.textContent = "Company: " + user.company.name;

    li.append(name, email, city, company);
    usersList.appendChild(li);
  });
}

loadButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", function () {
  const searchTerm = filterInput.value.trim().toLowerCase();

  const filtered = users.filter(function (user) {
    return user.name.toLowerCase().includes(searchTerm);
  });

  renderUsers(filtered);
});