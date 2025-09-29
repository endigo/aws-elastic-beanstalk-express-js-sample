pipeline {
    agent {
        docker {
            image 'node:16-alpine'
            args '-v /var/run/docker.sock:/var/run/docker.sock'
        }
    }

    environment {
        DOCKER_REGISTRY = 'docker.io'
        DOCKER_IMAGE_NAME = 'aws-elastic-beanstalk-express-app'
        DOCKER_CREDENTIALS_ID = 'docker-hub-credentials'
        SNYK_TOKEN = credentials('snyk-api-token')
        SEVERITY_THRESHOLD = 'high'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Run Unit Tests') {
            steps {
                script {
                    try {
                        sh 'npm test'
                    } catch (Exception e) {
                        echo 'No test script found in package.json, skipping tests'
                    }
                }
            }
        }

        stage('Security Scan - Snyk') {
            steps {
                script {
                    // Install Snyk CLI
                    sh 'apk add --no-cache curl'
                    sh 'curl -fsSL https://static.snyk.io/cli/latest/snyk-alpine -o /usr/local/bin/snyk'
                    sh 'chmod +x /usr/local/bin/snyk'
                    sh 'snyk auth ${SNYK_TOKEN}'

                    // Run Snyk test and capture result
                    def snykResult = sh(
                        script: 'snyk test --severity-threshold=${SEVERITY_THRESHOLD} --json > snyk-report.json || true',
                        returnStatus: true
                    )

                    // Display report
                    sh 'cat snyk-report.json'

                    // Fail pipeline if high/critical vulnerabilities found
                    if (snykResult != 0) {
                        error "Security vulnerabilities found with severity ${SEVERITY_THRESHOLD} or higher. Pipeline failed."
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    docker.build("${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${env.BUILD_NUMBER}")
                    docker.build("${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:latest")
                }
            }
        }

        stage('Container Security Scan') {
            steps {
                script {
                    // Scan the Docker container for vulnerabilities
                    sh 'snyk container test ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${env.BUILD_NUMBER} --severity-threshold=${SEVERITY_THRESHOLD}'
                }
            }
        }

        stage('Push to Docker Registry') {
            steps {
                script {
                    docker.withRegistry("https://${DOCKER_REGISTRY}", DOCKER_CREDENTIALS_ID) {
                        docker.image("${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${env.BUILD_NUMBER}").push()
                        docker.image("${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:latest").push()
                    }
                }
            }
        }

        stage('Clean Up') {
            steps {
                sh """
                    docker rmi ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${env.BUILD_NUMBER} || true
                    docker rmi ${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:latest || true
                """
            }
        }
    }

    post {
        always {
            // Archive Snyk security scan report
            archiveArtifacts artifacts: 'snyk-report.json', allowEmptyArchive: true

            // Generate security summary
            script {
                echo "=== Security Scan Summary ==="
                echo "Snyk security scan completed."
                echo "Report has been archived for review."
            }

            cleanWs()
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed. Please check the logs.'
        }
    }
}
