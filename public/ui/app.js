async function loadContainers() {
  const res = await fetch('/api/containers');
  const containers = await res.json();

  const grid = document.getElementById('container-grid');
  grid.innerHTML = ''; // clear old cards

  // Container cards
  containers.forEach(c => {
    let card = document.createElement('div');
    card.id = `card-${c.name}`;
    card.className = 'container-card';
    card.innerHTML = `
      <div class="card-header">
        <h3>${c.friendly_name || c.name}</h3>
        <span id="status-led-${c.name}" class="status-led"></span>
      </div>
    `;
    card.addEventListener('click', () => openEditModal(c));
    grid.appendChild(card);

    // Update status LED
    fetch(`/api/containers/${c.name}/status`)
      .then(r => r.json())
      .then(status => {
        const led = document.getElementById(`status-led-${c.name}`);
        led.style.backgroundColor = status.running ? '#34bfa3' : 'gray';
      });
  });

  // Add card (only one)
  const addCard = document.createElement('div');
  addCard.id = 'add-container-card';
  addCard.className = 'container-card add-card';
  addCard.innerHTML = '<span>+</span>';
  addCard.onclick = () => {
    document.getElementById('add-container-modal').style.display = 'flex';
  };
  grid.appendChild(addCard);
}

// Initial load
loadContainers();
setInterval(() => {
  loadContainers(); // will not duplicate + card now
}, 5000);

// Modal Cancel button
document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('add-container-modal').style.display = 'none';
});

// Modal submit
document.getElementById('modal-submit').addEventListener('click', async () => {
  const name = document.getElementById('modal-name').value.trim();
  const friendly_name = document.getElementById('modal-friendly-name').value.trim() || name;
  const url = document.getElementById('modal-url').value.trim();
  const idleTimeout = parseInt(document.getElementById('modal-idle').value, 10) || 60;
  const host = document.getElementById('modal-host').value.trim();
  const active = document.getElementById('modal-active').checked;

  if (!name || !url) {
    alert('Name and URL are required');
    return;
  }

  const newContainer = { name, friendly_name, url, host, idleTimeout, active };

  try {
    await fetch('/api/containers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newContainer)
    });

    // Close modal
    document.getElementById('add-container-modal').style.display = 'none';

    // Clear form
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-friendly-name').value = '';
    document.getElementById('modal-url').value = '';
    document.getElementById('modal-idle').value = '60';

    // Refresh grid
    loadContainers();
  } catch (err) {
    alert('Failed to add container: ' + err.message);
  }
});

// Edit containers

const editModal = document.getElementById('edit-container-modal');

// Open the edit modal and populate fields
function openEditModal(container) {
  document.getElementById('edit-friendly-name').value = container.friendly_name;
  document.getElementById('edit-name').value = container.name;
  document.getElementById('edit-url').value = container.url;
  document.getElementById('edit-host').value = container.host || '';
  document.getElementById('edit-idle').value = container.idleTimeout;
  document.getElementById('edit-active').checked = container.active;

  editModal.style.display = 'flex';
}

// Close modal
document.getElementById('edit-cancel').addEventListener('click', () => {
  editModal.style.display = 'none';
});

// Save changes
document.getElementById('edit-save').addEventListener('click', async () => {
  const updatedContainer = {
    friendly_name: document.getElementById('edit-friendly-name').value.trim(),
    name: document.getElementById('edit-name').value.trim(),
    url: document.getElementById('edit-url').value.trim(),
    host: document.getElementById('edit-host').value.trim(),
    idleTimeout: parseInt(document.getElementById('edit-idle').value, 10) || 60,
    active: document.getElementById('edit-active').checked
  };

  if (!updatedContainer.name || !updatedContainer.url) {
    alert('Name and URL are required');
    return;
  }

  try {
    await fetch(`/api/containers/${updatedContainer.name}`, {
      method: 'PUT', // assumes your backend supports PUT for updates
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedContainer)
    });

    editModal.style.display = 'none';
    loadContainers();
  } catch (err) {
    alert('Failed to save container: ' + err.message);
  }
});

// Delete container
document.getElementById('edit-delete').addEventListener('click', async () => {
  const name = document.getElementById('edit-name').value.trim();
  if (!confirm(`Delete container "${name}"?`)) return;

  try {
    await fetch(`/api/containers/${name}`, { method: 'DELETE' });
    editModal.style.display = 'none';
    loadContainers();
  } catch (err) {
    alert('Failed to delete container: ' + err.message);
  }
});
