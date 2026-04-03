<template>
  <div class="teachers fade-in">
    <div class="page-header">
      <div>
        <h1 class="page-title">教师管理</h1>
        <p class="page-subtitle">管理所有教师信息</p>
      </div>
      <button class="btn btn-primary" @click="showModal = true">
        <span>+</span> 添加教师
      </button>
    </div>

    <div class="search-bar">
      <input
        type="text"
        class="input"
        placeholder="搜索教师姓名..."
        v-model="searchText"
      />
    </div>

    <div class="teachers-grid" v-if="filteredTeachers.length > 0">
      <div class="teacher-card" v-for="teacher in filteredTeachers" :key="teacher.id">
        <div class="teacher-avatar">{{ teacher.name.charAt(0) }}</div>
        <div class="teacher-info">
          <h3 class="teacher-name">{{ teacher.name }}</h3>
          <p class="teacher-subject" v-if="teacher.subject">{{ teacher.subject }}</p>
          <p class="teacher-phone" v-if="teacher.phone">{{ teacher.phone }}</p>
        </div>
        <div class="teacher-meta">
          <span class="course-count">{{ getCourseCount(teacher.id) }} 门课程</span>
        </div>
        <div class="teacher-actions">
          <button class="btn btn-text" @click="editTeacher(teacher)">编辑</button>
          <button class="btn btn-text" style="color: var(--color-danger)" @click="removeTeacher(teacher.id)">删除</button>
        </div>
      </div>
    </div>
    <div class="empty-state" v-else>
      <p>暂无教师数据</p>
      <button class="btn btn-primary" @click="showModal = true">添加第一位教师</button>
    </div>

    <!-- 添加/编辑弹窗 -->
    <div class="modal-overlay" v-if="showModal" @click.self="closeModal">
      <div class="modal">
        <h2 class="modal-title">{{ editingTeacher ? '编辑教师' : '添加教师' }}</h2>
        <form @submit.prevent="saveTeacher">
          <div class="form-group">
            <label>姓名 *</label>
            <input type="text" class="input" v-model="form.name" required placeholder="请输入教师姓名" />
          </div>
          <div class="form-group">
            <label>联系电话</label>
            <input type="tel" class="input" v-model="form.phone" placeholder="请输入联系电话" />
          </div>
          <div class="form-group">
            <label>教授科目</label>
            <input type="text" class="input" v-model="form.subject" placeholder="如：数学、英语" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea class="input" v-model="form.remark" rows="3" placeholder="其他说明"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
            <button type="submit" class="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getTeachers, addTeacher, updateTeacher, deleteTeacher } from '../utils/storage'
import { getCourses } from '../utils/storage'

const teachers = ref([])
const courses = ref([])
const searchText = ref('')
const showModal = ref(false)
const editingTeacher = ref(null)
const form = ref({
  name: '',
  phone: '',
  subject: '',
  remark: ''
})

onMounted(() => {
  teachers.value = getTeachers()
  courses.value = getCourses()
})

const filteredTeachers = computed(() => {
  if (!searchText.value) return teachers.value
  const search = searchText.value.toLowerCase()
  return teachers.value.filter(t => t.name.toLowerCase().includes(search))
})

function getCourseCount(teacherId) {
  return courses.value.filter(c => c.teacherId === teacherId).length
}

function editTeacher(teacher) {
  editingTeacher.value = teacher
  form.value = { ...teacher }
  showModal.value = true
}

function saveTeacher() {
  if (editingTeacher.value) {
    teachers.value = updateTeacher(editingTeacher.value.id, form.value)
  } else {
    teachers.value = addTeacher(form.value)
  }
  closeModal()
}

function removeTeacher(id) {
  if (confirm('确定要删除这个教师吗？')) {
    teachers.value = deleteTeacher(id)
  }
}

function closeModal() {
  showModal.value = false
  editingTeacher.value = null
  form.value = { name: '', phone: '', subject: '', remark: '' }
}
</script>

<style scoped>
.teachers {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.page-subtitle {
  color: var(--color-text-secondary);
  font-size: 15px;
}

.search-bar {
  margin-bottom: 24px;
}

.teachers-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.teacher-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.teacher-card:hover {
  box-shadow: var(--shadow-md);
}

.teacher-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}

.teacher-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.teacher-subject {
  font-size: 14px;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.teacher-phone {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.teacher-meta {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-bg-secondary);
}

.course-count {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.teacher-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: white;
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
}

.empty-state p {
  margin-bottom: 16px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: var(--radius-lg);
  padding: 32px;
  width: 100%;
  max-width: 480px;
}

.modal-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 8px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

@media (max-width: 768px) {
  .teachers-grid {
    grid-template-columns: 1fr;
  }
}
</style>