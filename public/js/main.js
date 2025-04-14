/**
 * GitDone - Main JavaScript file
 * Handles client-side functionality for the application
 */

document.addEventListener('DOMContentLoaded', function() {
  // Task completion toggle
  const taskCheckboxes = document.querySelectorAll('.task-checkbox');
  taskCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const taskId = this.dataset.taskId;
      const taskElement = document.getElementById(`task-${taskId}`);
      
      // Send AJAX request to update task status
      fetch(`/tasks/${taskId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then(response => response.json())
      .then(data => {
        if (data.completed) {
          taskElement.classList.add('task-completed');
        } else {
          taskElement.classList.remove('task-completed');
        }
      })
      .catch(error => {
        console.error('Error toggling task status:', error);
        // Revert checkbox state on error
        this.checked = !this.checked;
      });
    });
  });

  // Dynamic form fields for links
  const addLinkButton = document.getElementById('add-link-button');
  if (addLinkButton) {
    addLinkButton.addEventListener('click', function() {
      const linksContainer = document.getElementById('links-container');
      const linkCount = linksContainer.querySelectorAll('.link-group').length;
      
      const linkGroup = document.createElement('div');
      linkGroup.className = 'link-group flex space-x-2 mt-2';
      linkGroup.innerHTML = `
        <div class="w-2/3">
          <input type="url" name="links" placeholder="https://example.com" class="form-input" required>
        </div>
        <div class="w-1/3">
          <input type="text" name="link_labels" placeholder="Label (optional)" class="form-input">
        </div>
        <button type="button" class="remove-link-button text-red-500 hover:text-red-700">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      linksContainer.appendChild(linkGroup);
      
      // Add event listener to the remove button
      const removeButton = linkGroup.querySelector('.remove-link-button');
      removeButton.addEventListener('click', function() {
        linkGroup.remove();
      });
    });
  }

  // Code snippet syntax highlighting
  const codeSnippets = document.querySelectorAll('.code-snippet');
  if (codeSnippets.length > 0 && typeof hljs !== 'undefined') {
    codeSnippets.forEach(snippet => {
      hljs.highlightElement(snippet);
    });
  }

  // Project selection in task form
  const projectSelect = document.getElementById('project-select');
  if (projectSelect) {
    projectSelect.addEventListener('change', function() {
      const selectedOption = this.options[this.selectedIndex];
      const selectedValue = selectedOption.value;
      
      if (selectedValue && selectedValue !== '') {
        const selectedProjectsContainer = document.getElementById('selected-projects');
        const projectId = selectedValue;
        const projectName = selectedOption.textContent;
        
        // Check if project is already selected
        const existingProject = document.querySelector(`[data-project-id="${projectId}"]`);
        if (!existingProject) {
          const projectTag = document.createElement('div');
          projectTag.className = 'project-tag flex items-center mr-2 mb-2';
          projectTag.dataset.projectId = projectId;
          projectTag.innerHTML = `
            <span>${projectName}</span>
            <input type="hidden" name="project_ids" value="${projectId}">
            <button type="button" class="remove-project ml-1 text-secondary-800 hover:text-secondary-900">
              <i class="fas fa-times-circle"></i>
            </button>
          `;
          
          selectedProjectsContainer.appendChild(projectTag);
          
          // Add event listener to the remove button
          const removeButton = projectTag.querySelector('.remove-project');
          removeButton.addEventListener('click', function() {
            projectTag.remove();
          });
        }
        
        // Reset select to default option
        projectSelect.selectedIndex = 0;
      }
    });
  }

  // Due date picker initialization
  const dueDateInput = document.getElementById('due-date');
  if (dueDateInput && typeof flatpickr !== 'undefined') {
    flatpickr(dueDateInput, {
      enableTime: true,
      dateFormat: "Y-m-d H:i",
      altInput: true,
      altFormat: "F j, Y at h:i K"
    });
  }

  // Mobile menu toggle
  const mobileMenuButton = document.querySelector('[aria-controls="mobile-menu"]');
  const mobileMenu = document.getElementById('mobile-menu');
  
  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', function() {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      mobileMenu.classList.toggle('hidden');
    });
  }
});