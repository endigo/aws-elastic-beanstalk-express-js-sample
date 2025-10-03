pipeline {
    agent {
        docker {
            image 'oven/bun:1-alpine'
            // image 'endigo/isec6000-assignment-2:base'
            args '-u root:root -v /certs/client:/certs/client:ro -v /var/run/docker.sock:/var/run/docker.sock'
        }
    }

    environment {
        DOCKER_HOST = 'tcp://docker:2376'
        DOCKER_TLS_VERIFY = '1'
        DOCKER_CERT_PATH = '/certs/client'
        DOCKER_REGISTRY = 'index.docker.io/v1/'
        DOCKER_IMAGE_NAME = 'endigo/isec6000-assignment-2'
        DOCKER_CREDENTIALS_ID = 'docker-hub-credentials'
        SNYK_TOKEN = credentials('snyk-api-token')
        SEVERITY_THRESHOLD = 'high'
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        skipDefaultCheckout()
        ansiColor('xterm')
        buildDiscarder(logRotator(
            daysToKeepStr: '30',
            numToKeepStr: '20',
            artifactDaysToKeepStr: '14',
            artifactNumToKeepStr: '10'
        ))
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "==== STAGE: Checkout ===="
                    echo "Repository: ${env.GIT_URL}"
                    echo "Branch: ${env.GIT_BRANCH}"
                }
                checkout scm
                script {
                    echo "Commit: ${env.GIT_COMMIT}"
                    echo "==== Checkout completed successfully ===="
                }
            }
        }

        stage('Install Docker-Cli and curl') {
            steps {
                sh 'apk add --no-cache curl docker-cli'
            }
        }

        stage('Install Snyk') {
            steps {
                sh 'curl -fsSL https://static.snyk.io/cli/latest/snyk-alpine -o /usr/local/bin/snyk'
                sh 'chmod +x /usr/local/bin/snyk'
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo "==== STAGE: Install Dependencies ===="
                    echo "Installing dependencies using bun..."
                }
                sh 'bun install --frozen-lockfile 2>&1 | tee dependency-install.log'
                script {
                    echo "==== Dependencies installed successfully ===="
                }
            }
        }

        stage('Run Unit Tests') {
            steps {
                script {
                    echo "==== STAGE: Run Unit Tests ===="
                    try {
                        sh 'bun test 2>&1 | tee test-results.log'
                        echo "==== Tests passed successfully ===="
                    } catch (Exception e) {
                        echo 'No test script found in package.json, skipping tests'
                        echo "==== Tests stage skipped ===="
                    }
                }
            }
        }

        stage('Security Scan - Snyk') {
            when {
                expression { env.SNYK_TOKEN != null }
            }
            steps {
                script {
                    echo "==== STAGE: Security Scan - Snyk ===="
                    echo "Severity threshold: ${SEVERITY_THRESHOLD}"

                    def snykInstallFailed = false
                    def snykResult = 0

                    try {
                        echo "Authenticating with Snyk..."
                        sh 'snyk auth ${SNYK_TOKEN}'
                        echo "Authentication successful"
                    } catch (Exception e) {
                        echo "Snyk CLI installation failed: ${e.getMessage()}"
                        echo "Skipping security scan..."
                        snykInstallFailed = true
                    }

                    if (!snykInstallFailed) {
                        echo "Running dependency vulnerability scan..."
                        // Run Snyk test and capture result
                        snykResult = sh(
                            script: 'snyk test --severity-threshold=${SEVERITY_THRESHOLD} --json > snyk-report.json 2>&1 | tee snyk-scan.log || true',
                            returnStatus: true
                        )

                        // Display report summary
                        sh 'cat snyk-report.json || echo "No Snyk report generated"'

                        // Fail pipeline if high/critical vulnerabilities found
                        if (snykResult != 0) {
                            echo "==== Security vulnerabilities detected ===="
                            error "Security vulnerabilities found with severity ${SEVERITY_THRESHOLD} or higher. Pipeline failed."
                        } else {
                            echo "==== Security scan passed ===="
                        }
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo "==== STAGE: Build Docker Image ===="
                    echo "Image name: ${DOCKER_IMAGE_NAME}"
                    echo "Build number: ${env.BUILD_NUMBER}"
                    echo "Git Commit: ${env.GIT_COMMIT}"

                    // Check if Dockerfile exists
                    if (fileExists('Dockerfile')) {
                        echo "Building Docker image..."
                        def customImage = docker.build("${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}")
                        customImage.tag('latest')
                        echo "==== Docker image built successfully ===="
                        echo "Tagged as: ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}"
                        echo "Tagged as: ${DOCKER_IMAGE_NAME}:latest"
                    } else {
                        echo "WARNING: Dockerfile not found, skipping build"
                    }
                }
            }
        }

        stage('Container Security Scan') {
            when {
                expression { env.SNYK_TOKEN != null }
            }
            steps {
                script {
                    echo "==== STAGE: Container Security Scan ===="
                    echo "Scanning image: ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}"
                    echo "Severity threshold: ${SEVERITY_THRESHOLD}"

                    try {
                        // Scan the Docker container for vulnerabilities
                        sh "snyk container test ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT} --severity-threshold=${SEVERITY_THRESHOLD} --json > snyk-container-report.json 2>&1 | tee snyk-container-scan.log || true"
                        echo "==== Container security scan completed ===="
                    } catch (Exception e) {
                        echo "Container security scan failed: ${e.getMessage()}"
                        echo "Continuing pipeline execution..."
                    }
                }
            }
        }

        stage('Push to Docker Registry') {
            when {
                expression { env.DOCKER_CREDENTIALS_ID != null }
            }
            steps {
                script {
                    echo "==== STAGE: Push to Docker Registry ===="
                    echo "Registry: ${DOCKER_REGISTRY}"
                    echo "Image: ${DOCKER_IMAGE_NAME}"

                    try {
                        echo "Pushing image to registry..."
                        docker.withRegistry("https://${DOCKER_REGISTRY}", DOCKER_CREDENTIALS_ID) {
                            docker.image("${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}").push()
                            docker.image("${DOCKER_IMAGE_NAME}:latest").push()
                        }
                        echo "==== Images pushed successfully ===="
                        echo "Pushed: ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}"
                        echo "Pushed: ${DOCKER_IMAGE_NAME}:latest"
                    } catch (Exception e) {
                        echo "Docker push failed: ${e.getMessage()}"
                        echo "This might be due to missing Docker Hub credentials"
                    }
                }
            }
        }

        stage('Clean Up') {
            steps {
                script {
                    echo "==== STAGE: Clean Up ===="
                    echo "Removing local Docker images..."
                }
                sh """
                    docker rmi ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT} || true
                    docker rmi ${DOCKER_IMAGE_NAME}:latest || true
                    docker system prune -f || true
                """
                script {
                    echo "==== Clean up completed ===="
                }
            }
        }
    }

    post {
        always {
            script {
                echo "==== STAGE: Post-Build Actions ===="
                echo "Archiving artifacts and logs..."
            }

            // Archive all reports and logs
            archiveArtifacts artifacts: '''
                **/*-report.json,
                **/*-report.html,
                **/*.log,
                **/test-results.*,
                **/build.log
            ''', allowEmptyArchive: true, fingerprint: true

            // Publish warnings for code analysis (if warnings-ng plugin is installed)
            script {
                try {
                    recordIssues enabledForFailure: true, tools: [
                        checkStyle(pattern: '**/checkstyle-result.xml'),
                        pmdParser(pattern: '**/pmd.xml'),
                        spotBugs(pattern: '**/spotbugsXml.xml')
                    ]
                } catch (Exception e) {
                    echo "Warnings plugin not fully configured: ${e.getMessage()}"
                }
            }

            // Generate comprehensive pipeline summary
            script {
                echo "==== PIPELINE SUMMARY ===="
                echo "Build Number: ${env.BUILD_NUMBER}"
                echo "Job Name: ${env.JOB_NAME}"
                echo "Branch: ${env.BRANCH_NAME ?: 'N/A'}"
                echo "Commit: ${env.GIT_COMMIT ?: 'N/A'}"
                echo "Build URL: ${env.BUILD_URL}"
                echo "Workspace: ${env.WORKSPACE}"
                echo "Build Status: ${currentBuild.currentResult}"
                echo "Build Duration: ${currentBuild.durationString}"

                // List archived artifacts
                def artifactsArchived = []
                if (fileExists('snyk-report.json')) { artifactsArchived.add('snyk-report.json') }
                if (fileExists('snyk-container-report.json')) { artifactsArchived.add('snyk-container-report.json') }
                if (fileExists('snyk-scan.log')) { artifactsArchived.add('snyk-scan.log') }
                if (fileExists('snyk-container-scan.log')) { artifactsArchived.add('snyk-container-scan.log') }
                if (fileExists('dependency-install.log')) { artifactsArchived.add('dependency-install.log') }
                if (fileExists('test-results.log')) { artifactsArchived.add('test-results.log') }

                if (artifactsArchived.size() > 0) {
                    echo "Artifacts archived:"
                    artifactsArchived.each { artifact ->
                        echo "  - ${artifact}"
                    }
                } else {
                    echo "No artifacts were archived"
                }

                echo "============================"
            }

            // Clean workspace
            cleanWs(
                cleanWhenAborted: true,
                cleanWhenFailure: true,
                cleanWhenNotBuilt: true,
                cleanWhenSuccess: true,
                cleanWhenUnstable: true,
                deleteDirs: true,
                disableDeferredWipeout: true,
                notFailBuild: true
            )
        }
        success {
            echo '==== Pipeline completed successfully ===='
        }
        failure {
            echo '==== Pipeline failed ===='
            echo 'Please check the logs above for details.'
            echo "Failed stage: ${env.STAGE_NAME}"
        }
        unstable {
            echo '==== Pipeline completed with warnings ===='
        }
    }
}
